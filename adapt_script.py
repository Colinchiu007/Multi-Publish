
import ast, os, re, shutil

SRC_DIR = r'D:\Projects\OpenMontage	oolsideo'
DST_DIR = r'D:\Data\projects\Multi-Publish\packages\python-backend\src\multi_publishideo_creation\providersideo'
EXCLUDE = {'comfyui_video.py', 'pexels_video.py', 'pixabay_video.py'}

def clean_class_attributes(source_code):
    try:
        tree = ast.parse(source_code)
    except SyntaxError:
        return source_code
    
    remove_ranges = []
    ATTRS_TO_REMOVE = {
        'agent_skills', 'supports', 'input_schema', 'quality_score',
        'fallback_tools', 'side_effects', 'user_visible_verification',
        'retry_policy', 'resume_support', 'fallback', 'provider_matrix',
    }
    
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef):
            for item in node.body:
                if isinstance(item, ast.Assign):
                    for target in item.targets:
                        if isinstance(target, ast.Name) and target.id in ATTRS_TO_REMOVE:
                            if hasattr(item, 'end_lineno') and item.end_lineno:
                                remove_ranges.append((item.lineno, item.end_lineno))
    
    if not remove_ranges:
        return source_code
    
    remove_ranges.sort(reverse=True)
    lines = source_code.split('\n')
    for start, end in remove_ranges:
        del lines[start-1:end]
    
    return '\n'.join(lines)


def adapt_file(source_path, target_path):
    with open(source_path, 'r', encoding='utf-8') as f:
        content = f.read()
    original = content
    
    content = clean_class_attributes(content)
    
    content = content.replace(
        'from tools.base_tool import',
        'from multi_publish.video_creation.base_tool import'
    )
    content = re.sub(r',\s*RetryPolicy', '', content)
    content = re.sub(r'RetryPolicy,\s*', '', content)
    content = re.sub(r',\s*ResumeSupport', '', content)
    content = re.sub(r'ResumeSupport,\s*', '', content)
    content = content.replace(
        'from tools.video._shared import',
        'from multi_publish.video_creation.providers.video._shared import'
    )
    content = content.replace(
        'from tools.video.stock_sources.base import',
        'from .base import'
    )
    content = content.replace('import requests', 'import httpx')
    content = re.sub(r'\brequests\.get\(', 'httpx.get(', content)
    content = re.sub(r'\brequests\.post\(', 'httpx.post(', content)
    content = re.sub(r'\brequests\.put\(', 'httpx.put(', content)
    content = re.sub(r'\brequests\.delete\(', 'httpx.delete(', content)
    content = content.replace('requests.RequestException', 'httpx.RequestError')
    content = content.replace('.iter_content(chunk_size=', '.iter_bytes(')
    
    if content == original:
        return False
    
    os.makedirs(os.path.dirname(target_path), exist_ok=True)
    with open(target_path, 'w', encoding='utf-8') as f:
        f.write(content)
    return True


# Process all files
print('=== Adapting files ===')
for f in sorted(os.listdir(SRC_DIR)):
    if not f.endswith('.py') or f in EXCLUDE:
        continue
    if adapt_file(os.path.join(SRC_DIR, f), os.path.join(DST_DIR, f)):
        print(f'  OK: {f}')

ss_src = os.path.join(SRC_DIR, 'stock_sources')
ss_dst = os.path.join(DST_DIR, 'stock_sources')
for f in sorted(os.listdir(ss_src)):
    if not f.endswith('.py'):
        continue
    if adapt_file(os.path.join(ss_src, f), os.path.join(ss_dst, f)):
        print(f'  OK: stock_sources/{f}')

print('Done!')
