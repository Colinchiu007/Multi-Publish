## ADDED Requirements

### Requirement: 删除错误消息与删除目标保持一致

历史删除失败 SHALL 使用与实际删除目标一致的稳定消息键：项目删除使用 story2video.project_delete_failed，流水线运行删除使用 story2video.run_delete_failed。系统不得因身份字段错配而向用户显示项目删除失败消息。

#### Scenario: 项目删除返回失败

- **WHEN** 项目删除接口返回非零结果或抛出异常
- **THEN** 显示项目删除失败消息，保留项目记录，并记录可供诊断的受控错误信息

#### Scenario: 运行删除返回失败

- **WHEN** 流水线运行删除接口返回非零结果或抛出异常
- **THEN** 显示运行删除失败消息，保留运行记录，并记录可供诊断的受控错误信息

#### Scenario: 删除成功不显示失败消息

- **WHEN** 对应删除接口返回 code === 0
- **THEN** 只从历史列表移除同一身份的记录，不显示任一删除失败消息
