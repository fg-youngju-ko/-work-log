// 근무관리 계산 엔진 (순수 함수, DOM 의존 없음 - Node에서 바로 테스트하고
// 그대로 public/labor.html에 삽입한다). 근거: 근로기준법 제56조(연장50%/
// 야간50%/휴일 8h이내 50%·초과 100%), 제18조·시행령 제30조(주휴수당,
// 4주 평균 소정근로 15시간 이상 + 소정근로일 개근), 상시 5인 이상 사업장
// 전제(5인 미만은 제56조 가산 적용 제외 - 이 앱의 적용범위 밖).
(function (root) {
  const MIN_PER_DAY = 1440;

  function parseHM(s) {
    if (!s) return null;
    const m = String(s).trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  }

  // 겹치는 구간을 하나로 합쳐서 중복 차감을 방지(지각+조퇴+외출+휴게가 서로
  // 겹쳐도 실제로 일 안 한 시간은 딱 한 번만 빠지도록).
  function mergeIntervals(intervals) {
    const valid = intervals.filter((iv) => iv[1] > iv[0]).sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const iv of valid) {
      if (merged.length && iv[0] <= merged[merged.length - 1][1]) {
        merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], iv[1]);
      } else {
        merged.push([iv[0], iv[1]]);
      }
    }
    return merged;
  }
  function sumIntervals(intervals) {
    return intervals.reduce((s, iv) => s + (iv[1] - iv[0]), 0);
  }
  function intersectIntervals(a, b) {
    // a, b: 병합된 구간 리스트. 둘의 교집합 총 길이.
    let total = 0;
    for (const [as, ae] of a) {
      for (const [bs, be] of b) {
        const s = Math.max(as, bs), e = Math.min(ae, be);
        if (e > s) total += e - s;
      }
    }
    return total;
  }
  function subtractIntervals(base, subtract) {
    // base: [[s,e],...] 병합됨. subtract: [[s,e],...] 병합됨. base - subtract 결과 구간 리스트.
    let result = base.map((iv) => iv.slice());
    for (const [ss, se] of subtract) {
      const next = [];
      for (const [bs, be] of result) {
        if (se <= bs || ss >= be) { next.push([bs, be]); continue; }
        if (ss > bs) next.push([bs, Math.min(ss, be)]);
        if (se < be) next.push([Math.max(se, bs), be]);
      }
      result = next;
    }
    return result.filter((iv) => iv[1] > iv[0]);
  }

  const DEFAULT_SETTINGS = {
    hourlyWageHistory: [], // [{effectiveFrom:'YYYY-MM-DD', wage:Number}] - 적용일 오름차순
    scheduledDays: [1, 2, 3, 4, 5], // 0=일~6=토, 소정근로일(기본 월~금)
    scheduledStart: '08:30',
    scheduledEnd: '17:30',
    dailyScheduledMinutes: 480,
    weeklyScheduledMinutes: 2400, // 40시간
    payPeriodStartDay: 1, // 급여 집계기간 시작일(1=매월 1일 ~ 말일)
    // 점심(고정 1시간)·저녁(17:30~18:00 고정 30분) 휴게 - 근로기준법 제54조상
    // 의무 휴게라 "추측"이 아니라 "정해진 규칙"으로 보고, 근무 구간이 이 시간대를
    // 지나가면 사용자가 매번 입력하지 않아도 자동으로 제외한다. 실제로 쉬지
    // 않고 계속 근무했다면 레코드별 skipLunch/skipDinner로 끈다.
    lunchStart: '12:00',
    lunchEnd: '13:00',
    dinnerStart: '17:30',
    dinnerEnd: '18:00',
  };

  function mergeSettings(s) {
    return Object.assign({}, DEFAULT_SETTINGS, s || {}, {
      hourlyWageHistory: (s && Array.isArray(s.hourlyWageHistory) ? s.hourlyWageHistory : [])
        .slice()
        .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1)),
    });
  }

  // 특정 날짜에 적용되는 시급(적용일 저장 방식 - 과거 급여가 임의로 안 바뀌게).
  function wageOn(dateStr, settings) {
    const hist = settings.hourlyWageHistory;
    let wage = null;
    for (const h of hist) {
      if (h.effectiveFrom <= dateStr) wage = h.wage;
      else break;
    }
    return wage; // null이면 "확인 필요"(시급 미설정)
  }

  function dow(dateStr) {
    return new Date(dateStr + 'T00:00:00').getDay();
  }
  function isScheduledDay(dateStr, settings) {
    return settings.scheduledDays.includes(dow(dateStr));
  }
  function mondayOf(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const diff = d.getDay() === 0 ? -6 : 1 - d.getDay();
    d.setDate(d.getDate() + diff);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  function addDays(dateStr, n) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + n);
    const pad = (x) => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  function weekDates(mondayStr) {
    return Array.from({ length: 7 }, (_, i) => addDays(mondayStr, i));
  }

  const EMPTY_RECORD = Object.freeze({ dayType: 'work', leaveHours: 0, clockIn: null, clockOut: null, excluded: [], holidayWorked: false, skipLunch: false, skipDinner: false, memo: '' });

  function getRecord(records, dateStr) {
    return records[dateStr] || EMPTY_RECORD;
  }

  function fixedWindowMinutes(startStr, endStr) {
    const s = parseHM(startStr), e = parseHM(endStr);
    if (s === null || e === null || e <= s) return null;
    return [s, e];
  }

  // 하루의 "실제 근로 구간"(병합된 [시작,종료] 리스트, 분 단위, 자정을 넘는
  // 야근은 clockOut에 1440을 더해 표현). 지각·조퇴·외출·사용자가 직접 입력한
  // 휴게는 paid 여부와 무관하게 전부 "근로 아님"으로 빼되, 서로 겹쳐도 한 번만
  // 뺀다. 점심(기본 12:00~13:00)·저녁(17:30~18:00)은 근로기준법상 의무 휴게라
  // 근무 구간이 그 시간대를 지나가면 매번 입력하지 않아도 자동으로 같이 뺀다
  // (레코드의 skipLunch/skipDinner로 끌 수 있음 - 실제로 못 쉰 경우).
  function getWorkIntervals(record, rawSettings) {
    if (!record || record.dayType === 'absent') return [];
    if (record.dayType === 'leave' && !record.clockIn) return [];
    if (record.dayType === 'holiday' && !record.holidayWorked) return [];
    const inM = parseHM(record.clockIn);
    let outM = parseHM(record.clockOut);
    if (inM === null || outM === null) return [];
    if (outM <= inM) outM += MIN_PER_DAY; // 자정 넘어가는 근무

    const settings = rawSettings ? mergeSettings(rawSettings) : DEFAULT_SETTINGS;
    const excludedList = (record.excluded || []).map((e) => {
      let s = parseHM(e.start), eMin = parseHM(e.end);
      if (s === null || eMin === null) return [0, 0];
      if (eMin <= s) eMin += MIN_PER_DAY;
      return [s, eMin];
    });
    if (!record.skipLunch) {
      const w = fixedWindowMinutes(settings.lunchStart, settings.lunchEnd);
      if (w) excludedList.push(w);
    }
    if (!record.skipDinner) {
      const w = fixedWindowMinutes(settings.dinnerStart, settings.dinnerEnd);
      if (w) excludedList.push(w);
    }
    const excluded = mergeIntervals(excludedList);
    return subtractIntervals([[inM, outM]], excluded);
  }
  function getDayActualMinutes(record, settings) {
    return sumIntervals(getWorkIntervals(record, settings));
  }
  // 유급이지만 "근로"는 아닌 시간(연차/반차/반반차 유급휴가 + 유급 외출 등).
  function getDayPaidNonWorkMinutes(record) {
    if (!record) return 0;
    let m = (record.leaveHours || 0) * 60;
    (record.excluded || []).forEach((e) => {
      if (!e.paid) return;
      const s = parseHM(e.start), en = parseHM(e.end);
      if (s === null || en === null) return;
      m += Math.max(0, (en > s ? en : en + MIN_PER_DAY) - s);
    });
    return m;
  }

  const NIGHT_WINDOWS = [[22 * 60, 24 * 60], [24 * 60, 30 * 60]]; // 22:00~24:00, (다음날)00:00~06:00

  function nightMinutesOf(intervals) {
    return intersectIntervals(intervals, NIGHT_WINDOWS);
  }

  // 한 주(월~일)의 날짜별 실제근로 구간을 기준으로 연장/야간/휴일 분류.
  // 반환: { byDate: {date: {base,dailyOT,weeklyOT,night,holidayWithin8,holidayOver8,holidayPaidBase,paidNonWork,actualMinutes}}, weekActualTotal, weeklyAllowance:{eligible,minutes} }
  function classifyWeek(mondayStr, records, settings) {
    const dates = weekDates(mondayStr);
    const byDate = {};
    let weekBaseSum = 0; // 일 8h 캡 적용한 근무분 합(휴일근무 제외)
    const order = []; // weekBaseSum에 기여한 순서대로 [date, cappedBase] 기록(주 40h 초과분 역순 배분용)

    dates.forEach((dateStr) => {
      const rec = getRecord(records, dateStr);
      const intervals = getWorkIntervals(rec, settings);
      const actualMinutes = sumIntervals(intervals);
      const night = nightMinutesOf(intervals);
      const paidNonWork = getDayPaidNonWorkMinutes(rec);

      let dailyOT = 0, base = 0, holidayWithin8 = 0, holidayOver8 = 0, holidayPaidBase = 0;

      // "토/일이라서"가 아니라 "그 날이 소정근로일이 아닌데 근로를 했는가"로 판단.
      // 공휴일(dayType==='holiday')은 추가로 그 자체가 유급(일하지 않아도 지급).
      // 소정근로일이 아닌 보통의 휴무일(예: 그냥 쉬는 토요일)에 근무하면 휴일근로와
      // 동일한 가산(8h이내 50%/초과 100%)을 적용하되, 쉬는 날 자체의 기본급은 없음
      // (안 나오면 원래 무급이므로 "유급휴일 기본급"과는 별개).
      const isNonScheduledWork = rec.dayType !== 'holiday' && rec.dayType !== 'absent' && rec.dayType !== 'leave' && !isScheduledDay(dateStr, settings);
      if (rec.dayType === 'holiday') {
        holidayPaidBase = settings.dailyScheduledMinutes; // 유급휴일(관공서 공휴일, 상시5인↑ 유급 의무)
        holidayWithin8 = Math.min(actualMinutes, settings.dailyScheduledMinutes);
        holidayOver8 = Math.max(0, actualMinutes - settings.dailyScheduledMinutes);
        // 휴일근로는 연장근로(일/주 40h) 누적에 포함하지 않음(중복가산 방지)
      } else if (isNonScheduledWork) {
        holidayWithin8 = Math.min(actualMinutes, settings.dailyScheduledMinutes);
        holidayOver8 = Math.max(0, actualMinutes - settings.dailyScheduledMinutes);
      } else {
        base = Math.min(actualMinutes, settings.dailyScheduledMinutes);
        dailyOT = Math.max(0, actualMinutes - settings.dailyScheduledMinutes);
        weekBaseSum += base;
        order.push(dateStr);
      }

      byDate[dateStr] = { actualMinutes, base, dailyOT, night, holidayWithin8, holidayOver8, holidayPaidBase, paidNonWork, weeklyOT: 0 };
    });

    // 주 40시간(소정) 초과분을 "그 초과를 만든" 뒤쪽 날짜부터 역순으로 weeklyOT로 재분류.
    let excess = Math.max(0, weekBaseSum - settings.weeklyScheduledMinutes);
    for (let i = order.length - 1; i >= 0 && excess > 0; i--) {
      const d = byDate[order[i]];
      const move = Math.min(d.base, excess);
      d.base -= move;
      d.weeklyOT += move;
      excess -= move;
    }

    const weekActualTotal = dates.reduce((s, d) => s + byDate[d].actualMinutes, 0);

    // 주휴수당 판정: 소정근로일 개근(결근 없음, 연차/반차/반반차 사용은 출근 인정) + 주 소정근로 15h 이상
    const scheduledDatesThisWeek = dates.filter((d) => isScheduledDay(d, settings));
    const anyAbsent = scheduledDatesThisWeek.some((d) => getRecord(records, d).dayType === 'absent');
    // 기록 자체가 없는 날(미입력)은 "정상 출근"으로 간주하지 않는다(미입력 평일을
    // 자동 8시간 처리하지 않는다는 원칙을 주휴수당 판정에도 동일하게 적용) -
    // 이 경우 확정 지급/미지급을 가르지 않고 "확인 필요"로 둔다.
    const anyMissing = scheduledDatesThisWeek.some((d) => !records[d]);
    const eligible = !anyAbsent && !anyMissing && settings.weeklyScheduledMinutes >= 15 * 60 && scheduledDatesThisWeek.length > 0;
    const weeklyAllowanceMinutes = eligible
      ? Math.min(settings.weeklyScheduledMinutes, 40 * 60) / (40 * 60) * (8 * 60)
      : 0;

    return { byDate, weekActualTotal, weeklyAllowance: { eligible, minutes: weeklyAllowanceMinutes, needsReview: anyMissing && !anyAbsent } };
  }

  // 여러 주(월요일 날짜 목록)에 걸친 분류를 날짜별로 펼친 맵 반환.
  function classifyRange(startDate, endDate, records, settings) {
    const perDate = {};
    let wk = mondayOf(startDate);
    const lastMonday = mondayOf(endDate);
    const weeklyMeta = {};
    while (wk <= lastMonday) {
      const res = classifyWeek(wk, records, settings);
      weeklyMeta[wk] = res;
      Object.assign(perDate, res.byDate);
      wk = addDays(wk, 7);
    }
    return { perDate, weeklyMeta };
  }

  // 급여 계산: [startDate,endDate] 귀속 기간에 속하는 날짜만 집계(분류 자체는
  // 그 날이 속한 주 전체로 이미 수행됨 - 월경계 주간도 올바르게 처리됨).
  function calcPayroll(startDate, endDate, records, rawSettings) {
    const settings = mergeSettings(rawSettings);
    const { perDate, weeklyMeta } = classifyRange(startDate, endDate, records, settings);

    const dates = [];
    for (let d = startDate; d <= endDate; d = addDays(d, 1)) dates.push(d);

    let baseMinutes = 0, otMinutes = 0, nightMinutes = 0, holidayWithin8 = 0, holidayOver8 = 0, holidayPaidBaseMinutes = 0, paidNonWorkMinutes = 0;
    let weeklyAllowanceMinutes = 0;
    let needsReview = false;
    const reviewReasons = [];

    dates.forEach((dateStr) => {
      const rec = getRecord(records, dateStr);
      const day = perDate[dateStr] || { base: 0, dailyOT: 0, weeklyOT: 0, night: 0, holidayWithin8: 0, holidayOver8: 0, holidayPaidBase: 0, paidNonWork: 0 };
      baseMinutes += day.base;
      otMinutes += day.dailyOT + day.weeklyOT;
      nightMinutes += day.night;
      holidayWithin8 += day.holidayWithin8;
      holidayOver8 += day.holidayOver8;
      holidayPaidBaseMinutes += day.holidayPaidBase;
      paidNonWorkMinutes += day.paidNonWork;

      if (rec.dayType === 'work' && isScheduledDay(dateStr, settings) && !rec.clockIn && !rec.leaveHours) {
        needsReview = true;
        reviewReasons.push(`${dateStr}: 출퇴근 기록 없음(미입력 평일을 자동으로 8시간 처리하지 않음)`);
      }
      if (wageOn(dateStr, settings) === null) {
        needsReview = true;
      }
    });

    // 주휴수당: 월요일이 이 기간 안에 속하는 주만 포함(월 경계 주 중복 배분 방지)
    Object.keys(weeklyMeta).forEach((wk) => {
      if (wk < startDate || wk > endDate) return;
      if (weeklyMeta[wk].weeklyAllowance.eligible) weeklyAllowanceMinutes += weeklyMeta[wk].weeklyAllowance.minutes;
      if (weeklyMeta[wk].weeklyAllowance.needsReview) {
        needsReview = true;
        reviewReasons.push(`${wk} 주: 일부 소정근로일 기록 없음 - 주휴수당 확인 필요`);
      }
    });

    if (reviewReasons.length > 20) reviewReasons.length = 20;

    // 임금 계산: "그 날짜에 적용되는 시급"으로 그날 분량만큼만 계산해 날짜별로
    // 합산(시급이 기간 중 바뀌어도 과거 근무는 과거 시급으로 고정).
    // 가산 배율: 연장 150%(기본100%+가산50%), 야간 50%(다른 가산과 별도 중첩),
    // 휴일 8h이내 150%, 8h초과 200%, 유급휴일 자체 100%, 유급휴가(연차 등) 100%.
    let baseWage = 0, otWage = 0, nightWage = 0, holidayWage = 0, holidayPaidWage = 0, leaveWage = 0, weeklyAllowanceWage = 0;
    const wageMissingDates = [];
    dates.forEach((dateStr) => {
      const wage = wageOn(dateStr, settings);
      if (wage === null) { wageMissingDates.push(dateStr); return; }
      const day = perDate[dateStr] || { base: 0, dailyOT: 0, weeklyOT: 0, night: 0, holidayWithin8: 0, holidayOver8: 0, holidayPaidBase: 0 };
      const hourly = wage / 60; // 분당 단가
      baseWage += day.base * hourly;
      otWage += (day.dailyOT + day.weeklyOT) * hourly * 1.5;
      nightWage += day.night * hourly * 0.5;
      holidayWage += day.holidayWithin8 * hourly * 1.5;
      holidayWage += day.holidayOver8 * hourly * 2.0;
      holidayPaidWage += day.holidayPaidBase * hourly;
      leaveWage += getDayPaidNonWorkMinutes(getRecord(records, dateStr)) * hourly;
    });

    Object.keys(weeklyMeta).forEach((wk) => {
      if (wk >= startDate && wk <= endDate && weeklyMeta[wk].weeklyAllowance.eligible) {
        const wage = wageOn(wk, settings);
        if (wage !== null) weeklyAllowanceWage += weeklyMeta[wk].weeklyAllowance.minutes * (wage / 60);
        else wageMissingDates.push(wk);
      }
    });

    if (wageMissingDates.length) needsReview = true;

    const totalWage = baseWage + otWage + nightWage + holidayWage + holidayPaidWage + leaveWage + weeklyAllowanceWage;

    return {
      period: { startDate, endDate },
      minutes: {
        base: baseMinutes, overtime: otMinutes, night: nightMinutes,
        holidayWithin8, holidayOver8, holidayPaidBase: holidayPaidBaseMinutes,
        paidNonWork: paidNonWorkMinutes, weeklyAllowance: weeklyAllowanceMinutes,
      },
      wage: {
        base: round0(baseWage), overtime: round0(otWage), night: round0(nightWage),
        holiday: round0(holidayWage), holidayPaid: round0(holidayPaidWage),
        leave: round0(leaveWage), weeklyAllowance: round0(weeklyAllowanceWage),
        total: round0(totalWage),
      },
      needsReview,
      reviewReasons,
      wageMissingDates,
    };
  }
  function round0(n) { return Math.round(n); }

  // 연차 잔여: 부여/조정(leaveLedger, 수동) - 사용(labor_records의 leaveHours 합).
  // asOfDate 이전(포함)은 "사용(실적)", 이후는 "사용 예정"으로 분리.
  function calcLeaveBalance(leaveLedger, records, asOfDate) {
    const granted = leaveLedger.reduce((s, e) => s + (e.kind === 'grant' ? e.hours : 0), 0);
    const adjusted = leaveLedger.reduce((s, e) => s + (e.kind === 'adjust' ? e.hours : 0), 0);
    let usedActual = 0, usedPlanned = 0;
    Object.keys(records).forEach((dateStr) => {
      const h = records[dateStr].leaveHours || 0;
      if (!h) return;
      if (dateStr <= asOfDate) usedActual += h;
      else usedPlanned += h;
    });
    const remaining = granted + adjusted - usedActual - usedPlanned;
    return {
      granted, adjusted, usedActual, usedPlanned,
      remaining, remainingExcludingPlanned: granted + adjusted - usedActual,
    };
  }

  // 주간 실제 근로시간 요약(메인 화면용) - 52시간은 "목표"가 아니라 한도이므로
  // 미달을 "부족"으로 표기하지 않는다. 누적(오늘까지 실적)과 예상(이번 주 예정
  // 근무 포함)을 분리.
  function calcWeeklySummary(mondayStr, records, settings, todayStr) {
    const s = mergeSettings(settings);
    const res = classifyWeek(mondayStr, records, s);
    const dates = weekDates(mondayStr);
    let actualSoFar = 0, plannedRest = 0;
    dates.forEach((d) => {
      const mins = (res.byDate[d].base + res.byDate[d].dailyOT + res.byDate[d].weeklyOT + res.byDate[d].holidayWithin8 + res.byDate[d].holidayOver8);
      if (d <= todayStr) actualSoFar += mins;
      else plannedRest += mins; // 이미 입력된 예정 근무(캘린더/일일템플릿 등으로 미리 적은 경우)
    });
    const LIMIT = 52 * 60;
    return {
      weekStart: mondayStr,
      actualSoFarMinutes: actualSoFar,
      projectedTotalMinutes: actualSoFar + plannedRest,
      limitMinutes: LIMIT,
      remainingVsActual: LIMIT - actualSoFar, // 음수면 이미 초과
      remainingVsProjected: LIMIT - (actualSoFar + plannedRest),
    };
  }

  function fmtHM(mins) {
    const h = Math.floor(mins / 60), m = mins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  // 구 work52_manager(workhours_v4) 레코드를 새 labor.html 스키마로 변환.
  // 옛 모델이 가정했던 점심/저녁 휴게는 이제 새 엔진이 고정 시간대(기본
  // 12:00~13:00, 17:30~18:00)로 자동 적용하므로, 여기서는 excluded를 직접
  // 만들지 않고 clockIn/clockOut/skipDinner만 넘겨주면 된다(두 동작이 결과적으로
  // 일치: 옛 파일도 "17:30 이후 일하면 저녁 30분"을 썼고, 기본 8h 가정도
  // 08:30~17:30 안에 점심 1h가 포함된 것과 같음).
  // 반환: {detail, approximate} 또는 완전히 빈 레코드면 null.
  function convertLegacyRecord(oldRec, dow) {
    if (!oldRec || typeof oldRec !== 'object') return null;
    const memo = oldRec.memo || '';
    const approximate = false;
    const skipDinner = !!oldRec.skipDinner;

    if (oldRec.type === 'annual') {
      return { detail: { dayType: 'leave', leaveHours: 8, clockIn: null, clockOut: null, excluded: [], holidayWorked: false, skipLunch: false, skipDinner: false, memo }, approximate };
    }
    if (oldRec.type === 'absent') {
      return { detail: { dayType: 'absent', leaveHours: 0, clockIn: null, clockOut: null, excluded: [], holidayWorked: false, skipLunch: false, skipDinner: false, memo }, approximate };
    }
    if (oldRec.type === 'half') {
      const am = oldRec.halfTime !== 'PM';
      let clockIn = am ? '13:30' : '08:30', clockOut = am ? '17:30' : '12:30';
      if (am && oldRec.ot) {
        const ot = parseHM(oldRec.ot);
        if (ot !== null && ot > 17 * 60 + 30) clockOut = fmtHM(ot);
      }
      // 반차 근무 구간(오전 13:30~17:30 또는 오후 08:30~12:30)엔 점심시간이 없음
      return { detail: { dayType: 'leave', leaveHours: 4, clockIn, clockOut, excluded: [], holidayWorked: false, skipLunch: true, skipDinner, memo }, approximate };
    }
    if (oldRec.type === 'quarter') {
      const qt = oldRec.quarterTime || 'AM1';
      let clockIn, clockOut, excluded = [], skipLunch = true;
      if (qt === 'AM1') { clockIn = '10:30'; clockOut = '17:30'; }
      else if (qt === 'PM1') { clockIn = '08:30'; clockOut = '13:30'; }
      else if (qt === 'PM2') { clockIn = '08:30'; clockOut = '15:30'; }
      else { clockIn = '08:30'; clockOut = '17:30'; skipLunch = false; } // AM2: 08:30~17:30 전체 구간에 점심(12~13시)이 포함되므로 자동 적용되게 둠, 10:30~12:30 유급구간만 추가로 제외
      if (qt === 'AM2') excluded.push({ kind: 'break', start: '10:30', end: '12:30', paid: true });
      if ((qt === 'AM1' || qt === 'AM2') && oldRec.ot) {
        const ot = parseHM(oldRec.ot);
        if (ot !== null && ot > 17 * 60 + 30) clockOut = fmtHM(ot);
      }
      return { detail: { dayType: 'leave', leaveHours: 2, clockIn, clockOut, excluded, holidayWorked: false, skipLunch, skipDinner, memo }, approximate };
    }
    if (oldRec.type === 'holiday') {
      if (!oldRec.special) {
        return { detail: { dayType: 'holiday', leaveHours: 0, clockIn: null, clockOut: null, excluded: [], holidayWorked: false, skipLunch: false, skipDinner: false, memo }, approximate };
      }
      const pts = oldRec.special.split('~').map((x) => x.trim());
      const s = parseHM(pts[0]), e = parseHM(pts[1]);
      if (s === null || e === null || e <= s) return null;
      return {
        detail: { dayType: 'holiday', leaveHours: 0, clockIn: fmtHM(s), clockOut: fmtHM(e), excluded: [], holidayWorked: true, skipLunch: false, skipDinner, memo },
        approximate,
      };
    }
    // 평일 근무(명시적 type 없음) 또는 주말 특근(rec.special)
    if (dow === 0 || dow === 6) {
      if (!oldRec.special) return null; // 주말에 특근 기록 없으면 변환할 것 없음(쉬는 날)
      const pts = oldRec.special.split('~').map((x) => x.trim());
      const s = parseHM(pts[0]), e = parseHM(pts[1]);
      if (s === null || e === null || e <= s) return null;
      return {
        detail: { dayType: 'work', leaveHours: 0, clockIn: fmtHM(s), clockOut: fmtHM(e), excluded: [], holidayWorked: false, skipLunch: false, skipDinner, memo },
        approximate,
      };
    }
    // 평일: ot 또는 memo만 있는 경우 - 옛 모델은 "08:30~17:30 기본 8h"를 항상 가정했지만
    // 새 모델은 미입력을 추측하지 않으므로, 최소한 ot가 있어 끝시간을 알 수 있는
    // 경우만 변환하고 그렇지 않으면(순수 메모만) 변환하지 않음(확인 필요로 남음).
    if (oldRec.ot) {
      const ot = parseHM(oldRec.ot);
      if (ot === null || ot <= 17 * 60 + 30) return null;
      return { detail: { dayType: 'work', leaveHours: 0, clockIn: '08:30', clockOut: fmtHM(ot), excluded: [], holidayWorked: false, skipLunch: false, skipDinner, memo }, approximate };
    }
    return null; // memo만 있는 평일 등 - 출퇴근을 확정할 수 없어 변환 안 함(확인 필요로 남김)
  }

  root.LaborEngine = {
    parseHM, mergeIntervals, sumIntervals, intersectIntervals, subtractIntervals,
    DEFAULT_SETTINGS, mergeSettings, wageOn,
    mondayOf, addDays, weekDates, isScheduledDay,
    getWorkIntervals, getDayActualMinutes, getDayPaidNonWorkMinutes,
    classifyWeek, classifyRange, calcPayroll, calcLeaveBalance, calcWeeklySummary,
    convertLegacyRecord,
  };
})(typeof module !== 'undefined' ? module.exports : (window.WorkLog = window.WorkLog || {}));
