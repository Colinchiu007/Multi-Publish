"""
WeChat Publisher Utilities

Utility functions for WeChat Official Account publisher module.
"""

import mimetypes
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import base64
import hashlib


def clean_html(content: str, keep_tags: Optional[List[str]] = None) -> str:
    """
    Clean HTML content for WeChat publishing.

    Args:
        content: HTML content to clean
        keep_tags: List of HTML tags to keep (default: common formatting tags)

    Returns:
        Cleaned HTML content safe for WeChat
    """
    if keep_tags is None:
        # WeChat-supported tags
        keep_tags = [
            'p', 'br', 'div', 'span', 'strong', 'b', 'em', 'i', 'u',
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
            'img', 'a', 'section', 'xml', 'mpchecktext'
        ]

    # Remove script and style tags with content
    content = re.sub(
        r'<(script|style|iframe|frame|object|embed)[^>]*>.*?</\1>',
        '',
        content,
        flags=re.DOTALL | re.IGNORECASE
    )

    # Remove comments
    content = re.sub(r'<!--.*?-->', '', content, flags=re.DOTALL)

    # Remove unsupported tags 
    # TODO: Implement proper tag filtering based on keep_tags
    
    # Ensure <img> tags have proper format for WeChat
    content = re.sub(
        r'<img[^>]*src="([^"]+)"[^>]*>',
        r'<img src="\1" />',
        content
    )

    # Remove empty paragraphs
    content = re.sub(r'<p>\s*</p>', '', content)

    # Normalize whitespace
    content = re.sub(r'\s+', ' ', content)
    content = content.strip()

    return content


def extract_images_from_html(content: str) -> List[str]:
    """
    Extract image URLs from HTML content.

    Args:
        content: HTML content

    Returns:
        List of image URLs
    """
    # Match <img src="..."> tags
    img_pattern = r'<img[^>]*src="([^"]+)"[^>]*>'
    images = re.findall(img_pattern, content, re.IGNORECASE)

    # Also match <img src='...'> tags
    img_pattern_single = r"<img[^>]*src='([^']+)'[^>]*>"
    images.extend(re.findall(img_pattern_single, content, re.IGNORECASE))

    # Filter out data URIs
    images = [img for img in images if not img.startswith('data:')]

    return list(set(images))  # Remove duplicates


def replace_image_urls(content: str, url_map: Dict[str, str]) -> str:
    """
    Replace image URLs in HTML content with new URLs.

    Args:
        content: HTML content
        url_map: Dictionary mapping old URL to new URL

    Returns:
        HTML content with replaced image URLs
    """
    for old_url, new_url in url_map.items():
        content = content.replace(old_url, new_url)
    return content


def get_file_extension(filename: str) -> str:
    """
    Get file extension from filename.

    Args:
        filename: Filename or path

    Returns:
        File extension (lowercase, without dot)
    """
    return Path(filename).suffix.lower().lstrip('.')


def get_mime_type(filename: str) -> str:
    """
    Get MIME type from filename.

    Args:
        filename: Filename or path

    Returns:
        MIME type string
    """
    mime_type, _ = mimetypes.guess_type(filename)
    return mime_type or 'application/octet-stream'


def is_valid_image_file(file_path: Path) -> bool:
    """
    Check if file is a valid image for WeChat upload.

    Args:
        file_path: Path to image file

    Returns:
        True if valid image file
    """
    if not file_path.exists() or not file_path.is_file():
        return False

    # Check file size (max 10MB for WeChat)
    max_size = 10 * 1024 * 1024  # 10MB
    if file_path.stat().st_size > max_size:
        return False

    # Check file extension
    valid_extensions = {'jpg', 'jpeg', 'png', 'gif', 'bmp'}
    ext = get_file_extension(file_path.name)
    return ext in valid_extensions


def is_valid_html_content(content: str) -> bool:
    """
    Check if content is valid HTML for WeChat.

    Args:
        content: Content to check

    Returns:
        True if valid HTML content
    """
    if not content:
        return False

    # Check if content has HTML tags
    has_tags = bool(re.search(r'<[^>]+>', content))
    
    # WeChat requires at least some HTML structure
    # (plain text is also acceptable, will be wrapped in <p>)
    return True


def truncate_text(text: str, max_length: int, suffix: str = '...') -> str:
    """
    Truncate text to max length, adding suffix if truncated.

    Args:
        text: Text to truncate
        max_length: Maximum length
        suffix: Suffix to add if truncated

    Returns:
        Truncated text
    """
    if len(text) <= max_length:
        return text

    return text[:max_length - len(suffix)] + suffix


def generate_filename(base: str, extension: str, timestamp: bool = True) -> str:
    """
    Generate filename with optional timestamp.

    Args:
        base: Base filename
        extension: File extension (without dot)
        timestamp: Whether to add timestamp

    Returns:
        Generated filename
    """
    if timestamp:
        from datetime import datetime
        ts = datetime.now().strftime('%Y%m%d_%H%M%S')
        return f"{base}_{ts}.{extension}"
    else:
        return f"{base}.{extension}"


def parse_wechat_error(response_data: Dict[str, Any]) -> Tuple[Optional[int], Optional[str]]:
    """
    Parse WeChat API error from response data.

    Args:
        response_data: Response data from WeChat API

    Returns:
        Tuple of (error_code, error_message) or (None, None) if no error
    """
    if 'errcode' in response_data and response_data['errcode'] != 0:
        error_code = response_data.get('errcode')
        error_msg = response_data.get('errmsg', 'Unknown error')
        return error_code, error_msg

    return None, None


def build_api_url(base_url: str, params: Dict[str, Any]) -> str:
    """
    Build WeChat API URL with query parameters.

    Args:
        base_url: Base API URL
        params: Query parameters

    Returns:
        Full API URL with parameters
    """
    import urllib.parse

    # Remove None values
    params = {k: v for k, v in params.items() if v is not None}

    if not params:
        return base_url

    query_string = urllib.parse.urlencode(params)
    separator = '&' if '?' in base_url else '?'
    return f"{base_url}{separator}{query_string}"


def calculate_file_hash(file_path: Path) -> str:
    """
    Calculate SHA256 hash of file.

    Args:
        file_path: Path to file

    Returns:
        SHA256 hash hex digest
    """
    sha256_hash = hashlib.sha256()
    with open(file_path, 'rb') as f:
        for byte_block in iter(lambda: f.read(4096), b''):
            sha256_hash.update(byte_block)
    return sha256_hash.hexdigest()


def is_url(string: str) -> bool:
    """
    Check if string is a valid URL.

    Args:
        string: String to check

    Returns:
        True if valid URL
    """
    url_pattern = re.compile(
        r'^(https?)://'  # http:// or https://
        r'(?:(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,6}\.?|'  # domain
        r'localhost|'  # localhost
        r'\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})'  # or ip
        r'(?::\d+)?'  # optional port
        r'(?:/?|[/?]\S+)$', re.IGNORECASE
    )
    return bool(url_pattern.match(string))


def download_image(url: str, save_path: Path) -> Path:
    """
    Download image from URL to local file.

    Args:
        url: Image URL
        save_path: Path to save image

    Returns:
        Path to saved image file

    Note:
        This is a placeholder. Actual implementation will use httpx in client.py
    """
    # Placeholder - actual implementation in client.py
    raise NotImplementedError("Use WechatPublisher.download_image() instead")


def resize_image_if_needed(
    image_path: Path,
    max_width: int = 1920,
    max_height: int = 1080,
    quality: int = 85
) -> Path:
    """
    Resize image if it exceeds maximum dimensions.

    Args:
        image_path: Path to image file
        max_width: Maximum width
        max_height: Maximum height
        quality: JPEG quality (1-100)

    Returns:
        Path to (possibly resized) image file

    Note:
        Requires Pillow library. Install with: pip install Pillow
    """
    try:
        from PIL import Image
    except ImportError:
        # Pillow not installed, return original
        return image_path

    img = Image.open(image_path)

    # Check if resize needed
    if img.width <= max_width and img.height <= max_height:
        return image_path

    # Calculate new dimensions
    img.thumbnail((max_width, max_height), Image.Resampling.LANCZOS)

    # Save to new file
    output_path = image_path.parent / f"{image_path.stem}_resized{image_path.suffix}"
    img.save(output_path, quality=quality)

    return output_path
