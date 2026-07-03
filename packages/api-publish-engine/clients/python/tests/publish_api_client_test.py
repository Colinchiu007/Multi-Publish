"""Tests for publish_api_client.py"""
def test_import():
    from packages.api_publish_engine.clients.python.publish_api_client import PublishApiClient
    assert PublishApiClient is not None
