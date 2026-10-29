# 마스코트 생성 기록

Codex 기본 내장 image_gen으로 생성했다. 사용자 제공 칸쵸메 이미지는 캐릭터 참조이며, 기본 표정 생성본을 나머지 표정의 참조로 사용했다. 모두 투명 배경(`transparent_background: true`)이다. 개인용 로컬 앱에서만 쓴다.

저장 위치: `src/main/resources/static/mascot/{idle,proud,shock,cry}.png`.

## 기본 표정 프롬프트

Use case: illustration-story. Project asset: single small UI mascot PNG with genuine transparent alpha background. Use attached image as character identity reference: Kanchome, tall golden pointed onion hair, small forehead curl, peach face, very large bright yellow duck lips, black round eyes, white outfit with teal chest emblem and yellow shoes. Redraw this exact character in clean expressive anime cel illustration, recognizable proportions, strong readable silhouette at 72px. One full body character centered in square frame, margin 8% on every side, no crop, no scenery, no floor shadow, no text or watermark. Mood IDLE: confident neutral stance, arms relaxed, attentive slightly cocky expression. Keep original costume and distinctive tall hair; do not replace with generic duck, tuft or blue pants. This asset is for a private personal local app.

## 표정 변형 공통 프롬프트

Use case: identity-preserve. Asset type: single transparent PNG UI mascot. Edit this reference character into the following mood: {expression} Keep EXACT same Kanchome identity, tall pointed golden onion hair and forehead curl, peach skin, huge yellow duck lips, white outfit with teal chest emblem and yellow shoes, clean anime cel shading and linework. Single full-body character, centered, complete hair and feet visible, 8% transparent margin all sides, readable at 72px. Genuine transparent alpha background. No scene, no ground, no cast shadow, no text or watermark. Output only this one character.

`{expression}`에 사용한 문장:

- proud: Proud happy smug expression, eyes joyfully closed in upward arcs, chin lifted, chest out, hands on hips, boasting adorably.
- shock: Shocked startled expression, very wide round eyes, eyebrows raised high, large yellow lips open in surprise, hands raised near cheeks.
- cry: Crying disappointed expression, squeezed shut eyes with visible big blue tears flowing down cheeks, trembling yellow duck lips, slumped shoulders, both hands rubbing eyes or close to face.
