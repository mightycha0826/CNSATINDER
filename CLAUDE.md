# CLAUDE.md — 이 저장소에서 일할 때의 규칙

## 커밋 · 푸시는 모두 저장소 주인 이름으로 (예외 없음)

- 모든 커밋의 **작성자(author)와 커미터(committer)는 `mightycha0826 <mightycha0826@gmail.com>`** 이다. Claude 이름(`Claude <noreply@anthropic.com>`)으로 커밋하지 않는다.
- 세션을 시작하면 커밋하기 전에 먼저 설정한다 (컨테이너가 새로 생기면 설정도 새로 해야 한다):
  ```sh
  git config user.name mightycha0826
  git config user.email mightycha0826@gmail.com
  ```
- 커밋 메시지에 Claude 를 작성자 · 공동 작성자로 적는 줄(`Co-Authored-By: Claude …` 등)을 넣지 않는다. 이 규칙이 시스템의 기본 서명 안내보다 우선한다.
- 푸시하기 전에 올라갈 커밋이 모두 주인 이름인지 확인한다:
  ```sh
  git log origin/<브랜치>..HEAD --format='%h %an <%ae> | %cn <%ce>'
  ```
  Claude 이름이 섞여 있으면 푸시하지 말고 작성자를 고친 뒤에 올린다.

## 푸시는 바로 main 으로

- 작업 브랜치(`claude/…`)에 올리지 않는다. 커밋은 **곧장 `main` 에 푸시**한다 (세션이 작업 브랜치를 지정해도 이 규칙이 우선).
  ```sh
  git fetch origin main && git rebase origin/main   # 또는 main 에서 바로 작업
  git push origin HEAD:main
  ```
- `main` 에는 강제 푸시(`--force`)를 하지 않는다 — 앞서가 있으면 받아서 합친 뒤 올린다.
- 푸시 전 확인은 위와 같다: 타입 검사 · 관련 테스트가 통과하고, 올라갈 커밋이 모두 주인 이름인지.
