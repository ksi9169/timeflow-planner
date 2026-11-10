# 일정관리 · 루티너리 · 타임트래커 통합 웹앱 — 작업 맥락 및 인수인계 노트 (GEMINI.md)

## 1. 프로젝트 개요 및 배포 환경
- **프로젝트명**: 타임플로우 — 개인 일정 · 루틴(루티너리 스타일) · 타임트래커 통합 관리 웹앱 (PWA)
- **배포 도메인 (Cloudflare Workers)**: `https://timeflow-planner.h1s.workers.dev`
- **GitHub 원격 저장소**: `https://github.com/ksi9169/timeflow-planner`
- **작업 경로**: `g:\내 드라이브\바이브 코딩\일정관리` (컴퓨터별 구글 드라이브 마운트 경로 호환)
- **기술 스택**:
  - Frontend: 반응형 웹앱 ([index.html](file:///g:/내%20드라이브/바이브%20코딩/일정관리/index.html), [styles.css](file:///g:/내%20드라이브/바이브%20코딩/일정관리/styles.css), [app.js](file:///g:/내%20드라이브/바이브%20코딩/일정관리/app.js), [manifest.json](file:///g:/내%20드라이브/바이브%20코딩/일정관리/manifest.json), [favicon.svg](file:///g:/내%20드라이브/바이브%20코딩/일정관리/favicon.svg), `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, `og-card.png`)
  - Backend & AI: Cloudflare Workers ([worker.js](file:///g:/내%20드라이브/바이브%20코딩/일정관리/worker.js), [wrangler.jsonc](file:///g:/내%20드라이브/바이브%20코딩/일정관리/wrangler.jsonc) — `GEMINI_FREE_API_KEY` 1순위 + `GEMINI_API_KEY` 유료 자동 전환 라우팅)
  - Database & Keep-Alive: LocalStorage 즉시 저장 + Supabase(`public.escape_rooms` 테이블 `TIMEFLOW:<동기화코드>` 실시간 클라우드 동기화) + 3일 주기 이중 잠김 방지(Cloudflare Cron `0 0 */3 * *` + [`.github/workflows/keep-alive.yml`](file:///g:/내%20드라이브/바이브%20코딩/일정관리/.github/workflows/keep-alive.yml))

## 2. 최근 완료된 작업 내역
- **일별 · 주별 · 월별 통합 뷰 및 표시 필터 고도화 (2026-11-10)**:
  - **대시보드 및 일정 탭의 일별 · 주별 · 월별 전환**: 메인 대시보드 중앙 타임트래커 패널에서 바로 `일별` / `주별` / `월별` 전환이 가능하며, `주간 · 월간 일정` 탭에서도 넓은 화면으로 동일하게 연동
  - **주별/일별 보기 모드 선택 (`계획 + 진행` / `계획만` / `진행만`)**: 주별 및 일별로 볼 때 계획 일정만 볼지, 실제 진행 기록만 볼지, 계획과 진행을 함께 비교할지 즉시 선택 가능하며, 주별 보기에서는 `요일별 보드`와 `시간대별 표` 두 가지 레이아웃을 지원
  - **월별 주요 일정 및 할 일 마감 중심 뷰**: 월간 달력 기본 모드를 `주요 일정 · 마감 중심`으로 구성하여 `★ 주요 일정`과 `할 일 마감`이 최우선으로 강조 표시되고, 달력 셀 안에서 바로 할 일 마감 완료 체크 및 상세 편집 가능 (`전체 보기` / `주요 일정만` / `할 일 마감만` 필터 및 우측 D-Day 마감 리스트 연동)
- **클라우드 원클릭 자동 배포 및 인프라 구축 완료 (2026-11-09)**:
  - **GitHub 원격 저장소 생성 및 푸시**: `https://github.com/ksi9169/timeflow-planner` 생성 및 `main` 브랜치 연동 완료
  - **Cloudflare Workers 배포**: `https://timeflow-planner.h1s.workers.dev` 정적 에셋 및 서버리스 API(`/api/ai`, `/api/sync`, `/api/keepalive`) 배포 완료, `GEMINI_FREE_API_KEY` 시크릿 등록 완료
  - **Supabase 이중 Keep-Alive 구축 및 검증**: `/api/keepalive` 엔드포인트 정상 응답 확인(`{"ok":true,"rowsChecked":1}`), Cloudflare Cron(`0 0 */3 * *`) 및 GitHub Actions 스케줄러([`keep-alive.yml`](file:///g:/내%20드라이브/바이브%20코딩/일정관리/.github/workflows/keep-alive.yml)) 첫 실행 트리거 완료
  - **PWA 아이콘 및 오픈그래프(OG) 미리보기 카드 생성**: `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, `og-card.png` (`1200×630`) 생성 및 [index.html](file:///g:/내%20드라이브/바이브%20코딩/일정관리/index.html) 메타 태그 연결
  - **다중 PC 호환 배치 스크립트 구성**: [setup_new_pc.bat](file:///g:/내%20드라이브/바이브%20코딩/일정관리/setup_new_pc.bat), [deploy_all.bat](file:///g:/내%20드라이브/바이브%20코딩/일정관리/deploy_all.bat) 생성 완료
- **핵심 웹앱(Phase 1) 및 Cloudflare Worker 백엔드 전체 구현 완료**:
  - 초고속 자연어 입력 바, 통합 대시보드(계획 대 실행 듀얼 타임트래커, 스톱워치, 오늘의 루틴), 루티너리 스타일 몰입형 플레이어(차임벨/한국어 TTS 음성 안내), 다중 알람 및 3분 반복 리마인드/5분 스누즈, 타임트래커 시간 분석 보고서 & 다음 달 목표 역산 설계 구현

## 3. 핵심 설계 철학 및 결정 맥락
- **UI 텍스트 규칙 철저 준수**: 모든 화면 레이블·버튼·카드 제목·표 머리글·드롭다운 옵션에 부연 설명용 괄호 표기 절대 금지.
- **클라우드플레어 기본 AI 라우팅 & 보안**: 소스코드 내에 시크릿 키를 하드코딩하지 않고 Cloudflare Worker Secret(`GEMINI_FREE_API_KEY`, `GEMINI_API_KEY`)을 사용하며, 로컬/오프라인 실행 시에도 내장 스마트 분석 엔진으로 100% 끊김 없이 동작하도록 하이브리드 구성.
- **실행과 기록의 일체화**: 루티너리 타이머 완주, 할 일 타이머 측정 완료, 계획 일정 완료 체크 시 모두 타임트래커 실제 사용 시간(Actual)에 자동 기록.

## 4. 다음 이어서 할 작업 (Next Steps)
- 실사용 피드백에 따른 UI/UX 세부 고도화 (드래그 앤 드롭 타임블록 시간 조정, 주간/월간 타임트래커 뷰 확장 등)
- 필요시 텔레그램 챗봇(`@BotFather` 토큰 연동) 웹훅 알림 및 채팅창 일정·타임트래커 양방향 연동 확장
