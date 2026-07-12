/**
 * 像素对比测试运行器
 */
const { VisualTestRunner } = require('../test-runner');
const path = require('path');

const pixelTests = [
  { name: 'home-baseline', route: '/' },
  { name: 'accounts-list', route: '/accounts' },
  { name: 'publish-form', route: '/publish' },
  { name: 'monitor-dashboard', route: '/monitor' },
  { name: 'analytics-overview', route: '/analytics' },
  { name: 'settings-general', route: '/settings' },
  { name: 'login-form', route: '/login' },
  { name: 'create-editor', route: '/create' },
];

async function run() {
  console.log('🎯 像素对比测试\n');
  
  const runner = new VisualTestRunner({
    url: process.env.TEST_URL || 'http://localhost:5173'
  });
  
  await runner.launch();
  
  for (const test of pixelTests) {
    console.log(`📷 ${test.name}...`);
    try {
      await runner.pixelRegressionTest(test.name, test.route);
    } catch (err) {
      console.log(`   ❌ ${err.message}`);
    }
  }
  
  await runner.close();
}

run().catch(console.error);
