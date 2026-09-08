/**
 * AI Taste Remover
 */

var AI_PHRASE_MAP = {
  '综上所述': '说到底',
  '值得注意的是': '有个细节很有意思',
  '不可否认': '说实话',
  '在当今社会': '现在',
  '随着社会的发展': '这些年',
  '首先': '第一',
  '其次': '第二',
  '最后': '再来说',
  '总而言之': '一句话',
  '此外': '还有',
  '与此同时': '同时',
  '毋庸置疑': '毫无疑问',
  '显而易见': '很明显',
  '众所周知': '大家都知道',
  '不言而喻': '不用多说',
  'In conclusion': 'Bottom line',
  "It is worth noting that": "Here's the thing:",
  'Furthermore': 'Plus',
  'Moreover': 'Also',
  'Nevertheless': 'But',
  'Consequently': 'So',
  'Therefore': 'So',
  'In addition': 'Also',
  'Additionally': 'Also',
  'It is important to note that': 'Keep in mind',
  'As a result': 'So',
  'Due to the fact that': 'Because',
  'In order to': 'To',
  'It should be noted that': 'Note that',
  'There is a growing concern': 'More people are worried',
  "In today's society": 'These days',
  'With the development of': 'As things change',
  'First and foremost': 'First off',
  'Last but not least': 'Finally',
}

var FORBIDDEN_OPENING_PATTERNS = [
  /^在当今社会[，,]/,
  /^随着[^，,]+的发展[，,]/,
  /^众所周知[，,]/,
  /^近年来[，,]/,
  /^当今时代[，,]/,
  /^In today's digital age[，,]/i,
  /^With the rapid development of/i,
  /^It is a well-known fact that/i,
]

var COLLOQUIAL_MAP = {
  '我们': '咱',
  '什么': '啥',
  '怎么': '咋',
  '没有': '没',
  '是不是': '是不',
  '这样': '这么',
  '那样': '那么',
}

function escapeRegex(str) {
  var specials = "[]^$.|?*+(){}!".split("");
  var result = str;
  for (var j = 0; j < specials.length; j++) {
    var s = specials[j];
    result = result.split(s).join("\\" + s);
  }
  return result;
}
function escapeRegex(str) {
  var specials = "[]^$.|?*+(){}!".split("");
  var result = str;
  for (var j = 0; j < specials.length; j++) {
    var s = specials[j];
    result = result.split(s).join("\\" + s);
  }
  return result;
}

function AITasteRemover(options) {
  options = options || {}
  this._enabled = options.enabled !== false
  this._intensity = Math.min(3, Math.max(1, options.intensity || 2))
  this._tone = options.tone || 'casual'
}

AITasteRemover.prototype.process = function(text) {
  if (!this._enabled || !text) return text
  var result = text
  result = this._replaceAIPhrases(result)
  result = this._checkOpenings(result)
  if (this._intensity >= 2) {
    result = this._randomizeSentenceLength(result)
  }
  if (this._intensity >= 3 && this._tone === 'casual') {
    result = this._colloquialize(result)
  }
  return result
}

AITasteRemover.prototype._replaceAIPhrases = function(text) {
  var result = text
  var keys = Object.keys(AI_PHRASE_MAP)
  for (var i = 0; i < keys.length; i++) {
    var ai = keys[i]
    var human = AI_PHRASE_MAP[ai]
    var regex = new RegExp(escapeRegex(ai), 'gi')
    result = result.replace(regex, human)
  }
  return result
}

AITasteRemover.prototype._checkOpenings = function(text) {
  for (var i = 0; i < FORBIDDEN_OPENING_PATTERNS.length; i++) {
    if (FORBIDDEN_OPENING_PATTERNS[i].test(text)) {
      text = text.replace(FORBIDDEN_OPENING_PATTERNS[i], '')
      if (text.length > 0) {
        text = text.charAt(0).toUpperCase() + text.slice(1)
      }
    }
  }
  return text
}

AITasteRemover.prototype._randomizeSentenceLength = function(text) {
  var sentences = text.split(/(?<=[。！？\.\!\?])/g)
  var result = []
  for (var i = 0; i < sentences.length; i++) {
    var s = sentences[i]
    if (s.length > 80) {
      var parts = s.split(/[，,]/g)
      if (parts.length > 2) {
        for (var j = 0; j < parts.length; j++) {
          result.push(parts[j].trim())
          if (j < parts.length - 1) {
            result.push(Math.random() > 0.5 ? '。' : '，')
          }
        }
      } else {
        result.push(s)
      }
    } else {
      result.push(s)
    }
  }
  return result.join('')
}

AITasteRemover.prototype._colloquialize = function(text) {
  var result = text
  if (this._tone === 'casual') {
    var keys = Object.keys(COLLOQUIAL_MAP)
    for (var i = 0; i < keys.length; i++) {
      var formal = keys[i]
      var casual = COLLOQUIAL_MAP[formal]
      var regex = new RegExp(formal, 'g')
      var self = this
      result = result.replace(regex, function() {
        return Math.random() > 0.4 ? casual : formal
      })
    }
  }
  return result
}

AITasteRemover.prototype.detectAITasteLevel = function(text) {
  if (!text) return 0
  var score = 0
  var hits = 0
  var keys = Object.keys(AI_PHRASE_MAP)
  for (var i = 0; i < keys.length; i++) {
    var regex = new RegExp(escapeRegex(keys[i]), 'gi')
    var matches = text.match(regex)
    if (matches) hits += matches.length
  }
  for (var j = 0; j < FORBIDDEN_OPENING_PATTERNS.length; j++) {
    if (FORBIDDEN_OPENING_PATTERNS[j].test(text)) hits += 2
  }
  var sentences = text.split(/[。！？\.\!\?]+/g).filter(Boolean)
  if (sentences.length > 0) {
    var avgLen = text.length / sentences.length
    if (avgLen > 60 || avgLen < 8) score += 0.1
  }
  score += Math.min(hits * 0.05, 0.5)
  return Math.min(1, Math.max(0, score))
}

module.exports = { AITasteRemover: AITasteRemover, AI_PHRASE_MAP: AI_PHRASE_MAP, FORBIDDEN_OPENING_PATTERNS: FORBIDDEN_OPENING_PATTERNS }
