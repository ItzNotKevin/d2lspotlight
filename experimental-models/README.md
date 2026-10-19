# Experimental models

This directory preserves trained candidates for offline evaluation. The application build does not read this directory or activate these models.

| Candidate | Training round | Status |
| --- | --- | --- |
| [academic-minilm-v1](academic-minilm-v1/README.md) | First, October 13, 2026 | Saved candidate; known subject regressions; not integrated |

Weights use Git LFS. Install Git LFS before cloning, or run the following after installing it in an existing checkout:

```sh
git lfs install
git lfs pull --include="experimental-models/**"
```

To clone the repository without downloading experimental weights, use `GIT_LFS_SKIP_SMUDGE=1 git clone <repository-url>`. Building or running the current application does not require these candidate files. Leave existing model assets, vector bundles and cache identities unchanged until a separate model rollout.
