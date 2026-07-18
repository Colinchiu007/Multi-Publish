'use strict'

const { buildPreload } = require('./build-preload')

module.exports = async function beforePack() {
  await buildPreload()
}
