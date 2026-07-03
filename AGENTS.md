# PROJECT-003 Multi-Publish 鈥?寮€鍙戞祦绋嬭鑼?
鏈枃浠跺畾涔夋湰椤圭洰寮€鍙戠殑瀹屾暣 SOP銆傛敮鎸?`AGENTS.md` 鐨?AI 宸ュ叿锛圕ursor銆丆laude Code銆丆line銆乄indsurf銆丟itHub Copilot 绛夛級鍚姩鏃惰嚜鍔ㄨ鍙栵紝纭繚鎵€鏈?AI 鍗忎綔鎸夎鑼冩墽琛屻€?
---

## 鏍稿績鍘熷垯

- **鍏堟枃妗ｅ啀浠ｇ爜**锛氭病鏈?PRD 涓嶅姩鎵嬶紝娌℃湁鏋舵瀯璁捐涓嶅姩鎵?- **TDD**锛氭祴璇曞厛浜庝唬鐮侊紝鎻愪氦鍓嶅叏閮ㄦ祴璇曢€氳繃
- **Code Review**锛氭瘡 2-3 涓姛鑳?review 涓€娆?- **git 鎻愪氦**锛氭墍鏈夊彉鏇村繀椤?commit锛屼笉鍏佽鏈窡韪唬鐮?- **閿欒澶勭悊**锛氭墍鏈夊叧閿矾寰勫繀椤绘湁閿欒澶勭悊

---

## AI 瑙掕壊鍒嗗伐

| 瑙掕壊 | 闃舵 | 浜у嚭鐗?|
|------|------|--------|
| **PM锛堜骇鍝佺粡鐞嗭級** | 闇€姹傚垎鏋?| PRD銆佺敤鎴锋晠浜嬨€佸姛鑳藉垪琛?|
| **鏋舵瀯甯?* | 鎶€鏈璁?| 鏋舵瀯鍥俱€佹妧鏈€夊瀷銆佺洰褰曠粨鏋?|
| **寮€鍙戝伐绋嬪笀** | 缂栫爜瀹炵幇 | 鍔熻兘浠ｇ爜銆佸崟鍏冩祴璇曪紙TDD锛?|
| **QA锛堟祴璇曪級** | 璐ㄩ噺楠岃瘉 | 娴嬭瘯鐢ㄤ緥銆佹祴璇曟姤鍛?|
| **CTO锛堟妧鏈€荤洃锛?* | 浠ｇ爜璇勫 | 瀹℃煡鎰忚銆佸畨鍏ㄥ璁?|

鍒囨崲瑙掕壊鍙ｄ护锛?> 銆岀幇鍦ㄤ綘浣滀负 PM锛屽啓 PRD銆?> 銆屽垏鎹㈡垚鏋舵瀯甯堣鑹诧紝璁捐鎶€鏈柟妗堛€?> 銆屼綔涓?CTO锛宺eview 涓€涓嬭繖娈典唬鐮併€?
---

## 7 闃舵寮€鍙戞祦绋?
### 闃舵 1锛氭兂娉曟緞娓咃紙CEO + COO锛?鎶婃ā绯婃兂娉曞彉鎴愪竴鍙ヨ瘽闇€姹傦紝纭锛氶」鐩悕绉般€佺洰鏍囩敤鎴枫€佹牳蹇冧环鍊笺€丮VP 鑼冨洿銆?
### 闃舵 2锛歅RD锛圥M锛?浜у嚭锛歅RD锛屽寘鍚洰鏍囩敤鎴枫€丳0/P1/P2 鍔熻兘鍒楄〃銆侀獙鏀舵爣鍑嗐€侀潪鍔熻兘闇€姹傘€?**CEO 绛惧瓧纭鍚庢墠鑳借繘鍏ヤ笅涓€闃舵銆?*

### 闃舵 3锛氭妧鏈灦鏋勶紙鏋舵瀯甯堬級
浜у嚭锛?-3 涓柟妗堝姣斻€佹帹鑽愭柟妗堛€佺洰褰曠粨鏋勩€佹暟鎹祦銆?**鍘熷垯锛氶€夋渶绠€鍗曠殑鏂规锛岃兘涓嶇敤鏁版嵁搴撳氨涓嶇敤锛岃兘涓嶇敤绗笁鏂规湇鍔″氨涓嶇敤銆?*

### 闃舵 4锛氬紑鍙戣鍒掞紙PM锛?鎶?MVP 鎷嗘垚 鈮?h 鐨勪换鍔★紝鏍囨敞渚濊禆鍏崇郴锛屾爣娉ㄥ彲骞惰椤广€?
### 闃舵 5锛氱紪鐮佸疄鐜帮紙寮€鍙?+ TDD锛?- 鍏堝啓娴嬭瘯锛屽啀鍐欎唬鐮?- 姣忔瀹屾垚鍋氭墜鍔ㄩ獙璇侊細鑳藉惎鍔?鉁?鏍稿績鍔熻兘 鉁?闈炴硶杈撳叆涓嶅穿婧?鉁?閿欒鎻愮ず鍙嬪ソ 鉁?
### 闃舵 6锛氫唬鐮佽瘎瀹★紙CTO锛?鏁村簱鎵弿浠ヤ笅缁村害锛?- **瀹夊叏**锛氱‖缂栫爜瀵嗛挜銆丼hell 娉ㄥ叆銆乪val
- **閿欒澶勭悊**锛歛sync vs .catch() 姣斾緥锛堝仴搴?鈮?:1锛?- **XSS**锛歷-html / dangerouslySetInnerHTML
- **Electron 瀹夊叏**锛歝ontextIsolation銆乶odeIntegration銆乶o-sandbox
- **鏃ュ織姹℃煋**锛歝onsole.log 鍦ㄧ敓浜т唬鐮佷腑
- **纭紪鐮佺瓑寰?*锛歸aitForTimeout

鍒嗙被杈撳嚭锛?```
馃敶 CRITICAL | 鏂囦欢:琛屽彿 | 鎻忚堪 | 淇寤鸿
馃煚 MAJOR   | 鏂囦欢:琛屽彿 | 鎻忚堪 | 淇寤鸿
馃煝 MINOR   | 鏂囦欢:琛屽彿 | 鎻忚堪 | 淇寤鸿
```
CRITICAL 蹇呴』淇鎵嶈兘缁х画銆?
### 闃舵 7锛氬彂甯冿紙杩愮淮锛?鎵撳寘/閮ㄧ讲銆佺敓鎴愬畨瑁呭寘鎴栭儴缃叉寚鍗椼€乬it tag銆?
---


## 璇︾粏瑙勮寖

鏈枃妗ｅ彧鍖呭惈寮€鍙戞祦绋嬫鏋躲€傝缁嗚鑼冨凡鎷嗗垎鍒?`references/` 瀛愮洰褰曪細

- **[references/quality-gates.md](references/quality-gates.md)** 鈥?璐ㄩ噺闂ㄧ璇︾粏璇存槑
- **[references/templates.md](references/templates.md)** 鈥?娌熼€氭ā鏉夸笌閬垮潙娓呭崟
- **[references/build.md](references/build.md)** 鈥?鎵撳寘楠岃瘉涓庢瀯寤哄彂甯?
## 鍙傝€冩枃浠?
- `PRD.md` 鈥?浜у搧闇€姹傛枃妗?- `P0/P1/P2-IMPLEMENTATION-PLAN.md` 鈥?瀹炵幇璁″垝
- `ARCHITECTURE-PLAYWRIGHT.md` 鈥?鏋舵瀯璁捐
- `DEVELOPMENT_REPORT.md` 鈥?寮€鍙戞姤鍛?- `CHANGELOG.md` 鈥?鍙樻洿鏃ュ織
- `DESIGN.md` 鈥?璁捐瑙勮寖
- `INTEGRATION.md` 鈥?闆嗘垚璇存槑

## 鐩綍缁撴瀯

```
.
鈹溾攢鈹€ apps/desktop/          # Electron 妗岄潰搴旂敤
鈹溾攢鈹€ packages/
鈹?  鈹溾攢鈹€ rpa-engine/        # RPA 鍙戝竷寮曟搸
鈹?  鈹斺攢鈹€ shared-utils/      # 鍏变韩宸ュ叿搴?鈹溾攢鈹€ team-workflow/scripts/ # 鍥㈤槦鑷姩鍖栬剼鏈?鈹溾攢鈹€ .hermes/plans/         # 瀹炴柦璁″垝瀛樻。
鈹溾攢鈹€ .github/workflows/     # CI/CD 閰嶇疆
鈹溾攢鈹€ PRD.md / CHANGELOG.md / README.md / AGENTS.md / INTEGRATION.md
鈹斺攢鈹€ ARCHITECTURE-PLAYWRIGHT.md / DESIGN.md / DEVELOPMENT_REPORT.md
```

## 鎵撳寘楠岃瘉锛堣川閲忛棬绂?QM-1 琛ュ厖锛?
- **鎵撳寘**锛歚npm run dist:win`锛堥渶 node_modules 閲屾湁 electron@33.4.0 + electron-builder@25.1.8锛?- **Playwright 娴忚鍣ㄦ崋缁?*锛氭墦鍖呭墠闇€鎵ц `cd apps/desktop && PLAYWRIGHT_BROWSERS_PATH=.playwright-browsers npx playwright install chromium`锛屾祻瑙堝櫒鑷姩鎹嗗叆 `extraResources`
- **绂荤嚎鏀寔**锛氬畨瑁呭寘鑷甫 Chromium 娴忚鍣紙~170MB锛夛紝鏃犻渶浠ｇ悊锛?  鑷姩鏇存柊妯″潡鍐呯疆 GFW 缃戠粶閿欒闈欓粯澶勭悊锛屾棤缃戠粶鏃堕潤榛樺け璐ヤ笉寮归敊
- **CI**锛?github/workflows/build.yml 鑷姩瀹屾垚 Playwright 瀹夎 + 娴忚鍣ㄦ崋缁?
## 寮哄埗璐ㄩ噺闂ㄧ锛圡UST锛?# 寮哄埗璐ㄩ噺娴佺▼

鏈」鐩殑鎵€鏈夐渶姹傚彉鏇淬€佽鍒掋€佸紑鍙戙€佽瘎瀹″拰娴嬭瘯锛?*蹇呴』**閬靛惊璐ㄩ噺鑺傛媿 skill 瀹氫箟鐨勬祦绋嬨€?
璐ㄩ噺鑺傛媿鐨勬牳蹇冨垎灞傦細
```
鏃ュ父寰幆锛堟瘡娆＄紪鐮佸繀鎵ц锛夛細
  source-driven-dev 鈫?TDD 鈫?incremental-impl 鈫?/review

闃舵妫€鏌ワ紙姣?Phase / 閲岀▼纰戠粨鏉熸椂蹇呮墽琛岋級锛?  verification-before-completion 鈫?/health 鈫?documentation-and-adrs

鐗规畩鍦烘櫙锛堟寜闇€鑷姩瑙﹀彂锛夛細
  /investigate | /cso | defense-in-depth | dispatching-parallel-agents | ...
```

璇︾粏瀹氫箟鏂囦欢锛歚.codex/skills/璐ㄩ噺鑺傛媿/SKILL.md`

鏂滄潬鍛戒护锛圕laude Code / Cursor锛夛細
- `/璐ㄩ噺鑺傛媿` 鈥?鍔犺浇骞舵墽琛岃川閲忚妭鎷嶆祦绋?
杩濊鍚庢灉锛?- 璺宠繃 TDD 鐩存帴鍐欎唬鐮?= 浠ｇ爜涓嶈鎺ュ彈
- 璺宠繃 /review 鐩存帴鍚堝叆 = 鍚堝叆琚嫆缁?- 璺宠繃闃舵妫€鏌ョ洿鎺ヨ繘鍏ヤ笅涓€ Phase = 椤圭洰鏆傚仠鐩村埌琛ュ畬妫€鏌?

