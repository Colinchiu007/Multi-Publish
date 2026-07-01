"""Fix publisher_manager.py truncation"""
with open('/sessions/sleepy-determined-dijkstra/mnt/projects/Multi-Publish/packages/python-backend/src/multi_publish/core/publisher_manager.py') as f:
    content = f.read()

# Append the missing end of the file
content += """
        try:
            publisher = await self.get_or_create(platform)
            return await publisher.check_auth()
        except Exception:
            return False

    async def close_all(self):
        \"\"\"关闭所有发布器实例\"\"\"
        for platform, publisher in self._publishers.items():
            try:
                await publisher.close()
            except Exception:
                pass
        self._publishers.clear()
"""

with open('/sessions/sleepy-determined-dijkstra/mnt/projects/Multi-Publish/packages/python-backend/src/multi_publish/core/publisher_manager.py', 'w') as f:
    f.write(content)
print('Done')