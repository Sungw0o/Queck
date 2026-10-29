# 마스코트 생성 기록

Codex 내장 image_gen으로 제작한 두 번째 세트다. 네 표정 모두 사용자가 처음 첨부한 파란 배경 원본만 직접 참조했다. 이전 생성 이미지는 참조하지 않았다. 원본의 얼굴·의상·주먹을 쥔 자세를 유지하고 배경과 표정만 바꾸도록 요청했다. 모두 transparent_background: true이며 개인용 로컬 앱에서만 쓴다.

저장 위치: `src/main/resources/static/mascot/{idle,proud,shock,cry}.png`.

## 공통 프롬프트

Faithful image edit of the ATTACHED ORIGINAL ANIME SCREENSHOT, not a redesign. This original screenshot is the ONLY identity and style reference. Preserve its exact character silhouette, head-to-body ratio, broad asymmetrical face, enormous oval yellow lips, golden onion-shaped hair with fine black strand lines and forehead curl, eye design, thin slightly imperfect anime linework, original muted cel colors, baggy white long-sleeve suit, dark teal fish emblem and yellow shoes. Keep the ORIGINAL legs-apart fighting stance, arm positions and viewing angle. Do not make cuter, rounder, cleaner, sticker-like, chibi, glossy, 3D or vector. Remove ALL blue scenery, speed lines, ground and ground shadow; real transparent background with clean edges. Entire character including hair and feet in a square canvas, consistent scale and framing, 5% padding, no labels or text.

## 표정별 추가 프롬프트

### idle

Change ONLY background to transparency and extend hair tip minimally if cut. Keep the exact original confident face and pose. Match original pixels as closely as possible.

### proud

Change ONLY facial expression to proud/smug: eyes happily closed in arcs, slightly lifted brows and confident closed yellow lips. Keep original pose, arms, head, body, costume, hair and original drawing style unchanged.

### shock

Change ONLY facial expression to shock: widen eyes and pupils, raise eyebrows, slightly open yellow lips in startled surprise. Keep original pose, arms, head size, body, costume, hair and original drawing style unchanged.

### cry

Change ONLY facial expression to crying: squeezed shut eyes, flowing blue tears down cheeks and downturned trembling yellow lips. Keep original pose, arms, head size, body, costume, hair and original drawing style unchanged.
