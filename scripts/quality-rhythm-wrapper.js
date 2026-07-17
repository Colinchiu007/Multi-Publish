/**
 * quality-rhythm-wrapper.js — 质量节拍强制触发wrapper
 * 
 * 所有代码修改操作都必须通过这个wrapper执行
 * 确保质量节拍在每个代码修改任务开始时都触发
 */

const qualityRhythmWrapper = {
  /**
   * 检查是否需要触发质量节拍
   * @param {string} operation - 操作类型
   * @param {object} context - 上下文信息
   * @returns {boolean} 是否需要触发
   */
  shouldTrigger(operation, context) {
    // 1. 文件修改检测
    const fileOperations = ['apply_patch', 'git_add', 'git_commit', 'write_file', 'delete_file'];
    if (fileOperations.includes(operation)) {
      return true;
    }

    // 2. 用户意图检测
    const intentKeywords = ['实现', '修复', '重构', '优化', '添加', '修改', '编辑', '创建', '删除'];
    if (context.userMessage && intentKeywords.some(keyword => context.userMessage.includes(keyword))) {
      return true;
    }

    // 3. 任务类型检测
    const taskTypes = ['feature', 'bugfix', 'refactor', 'optimization', 'config', 'documentation'];
    if (context.taskType && taskTypes.includes(context.taskType)) {
      return true;
    }

    // 4. 文件类型检测
    const codeFileExtensions = ['.js', '.ts', '.vue', '.jsx', '.tsx', '.py', '.java', '.go', '.rs', '.c', '.cpp', '.h'];
    if (context.filePath && codeFileExtensions.some(ext => context.filePath.endsWith(ext))) {
      return true;
    }

    return false;
  },

  /**
   * 执行质量节拍检查
   * @param {string} operation - 操作类型
   * @param {object} context - 上下文信息
   * @returns {object} 检查结果
   */
  async executeCheck(operation, context) {
    console.log('[质量节拍] 开始执行强制检查...');
    
    // 1. 检查是否需要触发
    if (!this.shouldTrigger(operation, context)) {
      console.log('[质量节拍] 当前操作不需要触发质量节拍');
      return { required: false, reason: '当前操作不需要触发质量节拍' };
    }

    // 2. 执行质量节拍检查
    console.log('[质量节拍] 检测到代码修改任务，强制触发质量节拍');
    
    // 3. 输出检查结果
    const result = {
      required: true,
      triggerType: this.getTriggerType(operation, context),
      phase: this.determinePhase(context),
      checklist: this.getChecklist(context),
      timestamp: new Date().toISOString()
    };

    console.log('[质量节拍] 检查完成:', result);
    return result;
  },

  /**
   * 获取触发类型
   * @param {string} operation - 操作类型
   * @param {object} context - 上下文信息
   * @returns {string} 触发类型
   */
  getTriggerType(operation, context) {
    if (context.taskType === 'bugfix') return 'Bug修复';
    if (context.taskType === 'feature') return '新功能';
    if (context.taskType === 'refactor') return '重构';
    if (operation === 'apply_patch') return '代码修改';
    if (operation === 'git_add' || operation === 'git_commit') return '代码提交';
    return '代码修改';
  },

  /**
   * 确定应该进入的Phase
   * @param {object} context - 上下文信息
   * @returns {string} Phase
   */
  determinePhase(context) {
    if (context.taskType === 'bugfix') return 'Phase 2 (开发期) - 直接进入排查';
    if (context.taskType === 'feature') return 'Phase 0 (探索期) - 先出PRD';
    if (context.taskType === 'refactor') return 'Phase 1 (规划期) - 先架构评审';
    return 'Phase 2 (开发期) - 日常循环';
  },

  /**
   * 获取检查清单
   * @param {object} context - 上下文信息
   * @returns {array} 检查清单
   */
  getChecklist(context) {
    const baseChecklist = [
      '✅ 代码变更有异常处理',
      '✅ 无硬编码路径/密钥/URL',
      '✅ 无console.log在生产代码中',
      '✅ require/import路径正确',
      '✅ 所有测试通过',
      '✅ 核心功能手动验证'
    ];

    if (context.taskType === 'bugfix') {
      return [
        ...baseChecklist,
        '✅ 找到第一性原因',
        '✅ 追溯测试逃逸',
        '✅ 识别系统性漏洞',
        '✅ 修复+回归保护测试',
        '✅ 防止再次发生'
      ];
    }

    return baseChecklist;
  },

  /**
   * 包装apply_patch操作
   * @param {function} originalFn - 原始函数
   * @returns {function} 包装后的函数
   */
  wrapApplyPatch(originalFn) {
    return async function(...args) {
      const context = {
        operation: 'apply_patch',
        filePath: args[0],
        userMessage: args[1]
      };
      
      const checkResult = await qualityRhythmWrapper.executeCheck('apply_patch', context);
      
      if (checkResult.required) {
        console.log('[质量节拍] 请先执行质量节拍检查，再进行代码修改');
        console.log('[质量节拍] 检查清单:', checkResult.checklist);
      }
      
      return originalFn.apply(this, args);
    };
  },

  /**
   * 包装git操作
   * @param {function} originalFn - 原始函数
   * @returns {function} 包装后的函数
   */
  wrapGitOperation(originalFn) {
    return async function(...args) {
      const context = {
        operation: 'git_operation',
        command: args[0],
        userMessage: args[1]
      };
      
      const checkResult = await qualityRhythmWrapper.executeCheck('git_operation', context);
      
      if (checkResult.required) {
        console.log('[质量节拍] 请先执行质量节拍检查，再进行git操作');
        console.log('[质量节拍] 检查清单:', checkResult.checklist);
      }
      
      return originalFn.apply(this, args);
    };
  }
};

// 导出wrapper
module.exports = qualityRhythmWrapper;

// 如果是直接运行，执行演示
if (require.main === module) {
  console.log('=== 质量节拍Wrapper演示 ===');
  
  // 演示1: Bug修复任务
  qualityRhythmWrapper.executeCheck('apply_patch', {
    taskType: 'bugfix',
    userMessage: '修复登录功能的bug',
    filePath: 'src/views/Login.vue'
  }).then(result => {
    console.log('Bug修复任务检查结果:', result);
  });
  
  // 演示2: 新功能任务
  qualityRhythmWrapper.executeCheck('apply_patch', {
    taskType: 'feature',
    userMessage: '实现用户注册功能',
    filePath: 'src/views/Register.vue'
  }).then(result => {
    console.log('新功能任务检查结果:', result);
  });
}
