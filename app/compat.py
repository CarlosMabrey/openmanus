"""
Compatibility layer for Python version differences.
This module provides workarounds for features that have changed across Python versions.
"""
import sys

# Handle collections.MutableSet removal in Python 3.10+
if sys.version_info >= (3, 10):
    from collections import abc
    sys.modules['collections'].MutableSet = abc.MutableSet 