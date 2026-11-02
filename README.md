# 업무일지

업무일지 작성/TODO/마인드맵/일일 시간표를 관리하는 개인용 도구. 데이터는 코드에 포함되지 않고
**Cloudflare D1**에만 저장됩니다.

- 프론트엔드: `public/index.html`(업무일지/TODO/카테고리/달력), `public/mindmap.html`(업무대제목별
  마인드맵 + 일일 시간표)
- API: `functions/api/`(Cloudflare Pages Functions)
- DB 스키마: `schema.sql`

## 접근

4자리 PIN으로 보호됩니다(나만 쓰는 개인용 도구 기준의 가벼운 보호 — 초기값 `0000`, 반드시
처음 접속 후 변경하세요). `index.html` 상단의 "🔑 PIN 변경" 버튼에서 변경할 수 있습니다.

## 데이터 구조

- `entries`(업무일지 기록) — 영구 누적되는 유일한 데이터라 행 단위 테이블로 관리(`/api/entries`).
- `kv_store` — todos/categories/categoryColors/dailyTemplates/dailyCompletions/calendarEvents/
  projects/projectColors. 완료 시 삭제되어 크기가 작게 유지되므로 키 하나당 JSON 값 하나로
  저장(`/api/kv`).
- `settings` — PIN 해시, 브루트포스 잠금 상태.

## 배포

```
npx wrangler pages deploy public --project-name=work-log --branch=main
```

최초 1회, D1에 스키마 적용:
```
npx wrangler d1 execute work-log-db --remote --file=schema.sql
```

로컬 개발:
```
npx wrangler pages dev public
```

## 기존(localStorage) 데이터 옮기기

이 앱은 과거에 GitHub Pages + localStorage로 운영됐습니다. 그 데이터는 이 사이트와 오리진이
달라 자동으로 넘어오지 않습니다 — 예전 사이트에서 "⬇ 백업 다운로드"로 JSON을 받은 뒤, 이
사이트에서 "⬆ 백업 업로드"로 그 파일을 올리면 병합됩니다.

데이터 백업은 앱의 [⬇ 백업 다운로드] 버튼을 이용하세요(매일 오전 1회 자동 다운로드도 켜져
있습니다). 백업/시드 파일(`seed*.sql`)은 커밋하지 마세요.
