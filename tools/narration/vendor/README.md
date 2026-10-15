# Bundled pure-Python SoX wrapper

`sox-1.5.0-py3-none-any.whl` is a wheel built from the official PyPI `sox==1.5.0`
source distribution. Upstream provides this version as a source archive only.
Bundling the small pure-Python wheel keeps source-code builds out of end-user
setup. It is the Python wrapper, not the separate SoX executable.

The original BSD-3-Clause license is included in the wheel at
`sox-1.5.0.dist-info/licenses/LICENSE`. Source URL/digest and the bundled wheel's
SHA-256 are recorded in `electron/narration/runtime-manifest.json`. Build used
Python 3.12.13 and setuptools 78.1.0, `setuptools.build_meta.build_wheel`, with no
dependency installation. Do not substitute an unverified local wheel.

Other wheels come from their pinned PyPI/PyTorch URLs. Their licenses and
distribution metadata are retained by normal wheel installation.
