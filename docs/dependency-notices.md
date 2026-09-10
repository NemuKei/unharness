# Supplemental distribution notice

The locked `@pixi/colord` 2.9.6 npm package declares MIT but omits its license file.
The build's `packaging/licenses/pixi-colord-2.9.6-LICENSE.md` is the unchanged notice from its upstream
[v2.9.6 commit](https://github.com/pixijs/colord/blob/5344fbf77b736f81cd33c21050021bc09bc9dd1d/LICENSE.md).
Its SHA256 is `7613d4594ee8b6163926af3435dae61c9e3d5a27cd137bd76a543ba40002d8fc`.

The build uses this reviewed copy only for that package version. A future version
without a bundled notice requires another review. Other production dependencies
retain their own complete license/notice files. Both browser builds emit their
license text; plugin assembly also supplies the omitted file before indexing the
distribution. No network request is needed for this step.
