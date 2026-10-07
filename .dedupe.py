import io, re

p = 'src/publish-api-server.js'
lines = io.open(p, encoding='utf-8').read().split('\n')

# 三份重复块的起止：第 1428/1477/1526 行起（1-based），
# 每份以 "        };" 结束。保留**最后一份**（前两份是被覆盖的死代码）。
starts = [i for i, l in enumerate(lines) if l.strip() == 'spec.components = {']
assert len(starts) == 3, "预期 3 份，实际 %d：%s" % (len(starts), starts)

def block_end(start_idx):
    """从 spec.components = { 起，找到配对的 '        };' 行（1-based 返回 end_idx_exclusive）。"""
    depth = 0
    for j in range(start_idx, len(lines)):
        depth += lines[j].count('{') - lines[j].count('}')
        if depth == 0 and j > start_idx:
            return j + 1
    raise AssertionError("未找到配对结尾，起点 %d" % start_idx)

ends = [block_end(s) for s in starts]
print("  三份块（1-based 行区间）:", [(s + 1, e) for s, e in zip(starts, ends)])
assert starts[0] < ends[0] <= starts[1] and starts[1] < ends[1] <= starts[2], "块区间重叠异常"

# 删前两份（含其后的空行），保留第三份
out = lines[:starts[0]] + lines[starts[1]:ends[1]] + lines[starts[2]:]
io.open(p, 'w', encoding='utf-8').write('\n'.join(out))

n = len(io.open(p, encoding='utf-8').read().split('\n'))
print("  去重后行数:", n)
print("  spec.components 剩余:", io.open(p, encoding='utf-8').read().count('spec.components = {'))
