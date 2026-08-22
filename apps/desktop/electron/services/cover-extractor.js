// @ts-check
/**
 * cover-extractor.js — 视频首帧截图封面提取器
 *
 * 使用 Electron 隐藏 BrowserWindow + HTML5 video/canvas 提取视频首帧为 JPEG 封面。
 * 无需 ffmpeg 等外部依赖。
 *
 * 用法：
 *   const { extractVideoCover } = require('./cover-extractor')
 *   const coverPath = await extractVideoCover('/path/to/video.mp4')
 */
const { BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const crypto = require('crypto')

const log = require('./logger')

/**
 * 从视频文件提取首帧截图作为封面
 * @param {string} videoPath - 视频文件的绝对路径
 * @param {object} [options]
 * @param {number} [options.width=1280] - 输出封面宽度
 * @param {number} [options.height=0] - 输出封面高度（0 = 按比例缩放）
 * @param {number} [options.quality=85] - JPEG 质量 (0-100)
 * @param {number} [options.seekTime=0.5] - 截取时间点（秒，0.5 避免纯黑首帧）
 * @returns {Promise<string|null>} 封面图片的临时文件路径，失败返回 null
 */
async function extractVideoCover(videoPath, options = {}) {
  const {
    width = 1280,
    height = 0,
    quality = 85,
    seekTime = 0.5,
  } = options

  if (!videoPath || !fs.existsSync(videoPath)) {
    log.warn('CoverExtractor', 'Video file not found: ' + videoPath)
    return null
  }

  const fileUrl = 'file:///' + videoPath.replace(/\\/g, '/')
  const outputDir = path.join(os.tmpdir(), 'multi-publish-covers')
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  const hash = crypto.createHash('md5').update(videoPath + seekTime).digest('hex').substring(0, 8)
  const outputPath = path.join(outputDir, 'cover-' + hash + '.jpg')

  // 如果已提取过，直接返回
  if (fs.existsSync(outputPath)) {
    log.info('CoverExtractor', 'Cover already exists: ' + outputPath)
    return outputPath
  }

  let win = null
  try {
    win = new BrowserWindow({
      show: false,
      width: width + 100,
      height: (height || 720) + 100,
      webPreferences: {
        offscreen: true,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    })

    const videoSrc = JSON.stringify(fileUrl)
    const html = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>'
      + '<video id="v" muted preload="auto" style="width:' + width + 'px"></video>'
      + '<canvas id="c"></canvas>'
      + '<scr' + 'ipt>'
      + 'var video=document.getElementById("v"),canvas=document.getElementById("c");'
      + 'var OW=' + width + ',OH=' + height + ',Q=' + quality + ',ST=' + seekTime + ';'
      + 'function capture(){var vw=video.videoWidth,vh=video.videoHeight;'
      + 'if(!vw||!vh)return null;'
      + 'var h=OH||Math.round(vw>0?(vh*OW/vw):vh);'
      + 'canvas.width=OW;canvas.height=h;'
      + 'var ctx=canvas.getContext("2d");'
      + 'ctx.drawImage(video,0,0,OW,h);'
      + 'return canvas.toDataURL("image/jpeg",Q/100);}'
      + 'function run(){return new Promise(function(res,rej){'
      + 'video.addEventListener("loadedmetadata",function(){'
      + 'video.currentTime=Math.min(ST,video.duration*0.1);});'
      + 'video.addEventListener("seeked",function(){try{res(capture())}catch(e){rej(e.message)}});'
      + 'video.addEventListener("error",function(){rej("video error")});'
      + 'video.src=' + videoSrc + ';video.load();});}'
      + 'window.__cp=run();'
      + '</scr' + 'ipt></body></html>'

    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))

    const dataUrl = await Promise.race([
      win.webContents.executeJavaScript('window.__cp'),
      new Promise(function(_, reject) { setTimeout(function() { reject(new Error('capture timeout')) }, 30000) }),
    ])

    if (!dataUrl || !dataUrl.startsWith('data:image/jpeg')) {
      log.warn('CoverExtractor', 'Invalid capture result')
      return null
    }

    const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, '')
    const buffer = Buffer.from(base64, 'base64')
    fs.writeFileSync(outputPath, buffer)

    log.info('CoverExtractor', 'Cover saved: ' + outputPath + ' (' + buffer.length + ' bytes)')
    return outputPath
  } catch (err) {
    log.error('CoverExtractor', 'Failed to extract cover: ' + err.message)
    return null
  } finally {
    if (win && !win.isDestroyed()) {
      win.destroy()
    }
  }
}

module.exports = { extractVideoCover }
