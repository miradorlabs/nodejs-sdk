# Changelog

## [2.0.0](https://github.com/miradorlabs/nodejs-sdk/compare/v1.7.0...v2.0.0) (2026-03-13)


### ⚠ BREAKING CHANGES

* removed deprecated functions
* create() returns client-generated traceId and setTraceId is deprecated

### Features

* add reslience changes to codebase ([0b4b2df](https://github.com/miradorlabs/nodejs-sdk/commit/0b4b2dfd3d24cad7445518b0099f40a25ac5804c))
* add reslience changes to codebase ([107ace5](https://github.com/miradorlabs/nodejs-sdk/commit/107ace5869ba6860dc3156a15592e28d05845760))
* remove deprecated functions ([af38639](https://github.com/miradorlabs/nodejs-sdk/commit/af386395ff59a62034af82c4b12454e939a29354))
* replace CreateTrace/UpdateTrace with idempotent Flush Trace RPC ([eaab131](https://github.com/miradorlabs/nodejs-sdk/commit/eaab1316d132518b2dbb282801c82277be0e2119))

## [1.7.0](https://github.com/miradorlabs/nodejs-sdk/compare/v1.6.0...v1.7.0) (2026-03-10)


### Features

* add addSafeTxHint for Safe multisig transaction tracking ([9e3ead9](https://github.com/miradorlabs/nodejs-sdk/commit/9e3ead924af51da600599c71e41c15ab231f97c7))
* add addSafeTxHint for Safe multisig tx tracking ([bfe3157](https://github.com/miradorlabs/nodejs-sdk/commit/bfe3157d53bd2e388bf16cede7bd73813bc2b4ec))

## [1.6.0](https://github.com/miradorlabs/nodejs-sdk/compare/v1.5.0...v1.6.0) (2026-03-06)


### Features

* add autoKeepAlive option to prevent zombie timers on resumed traces ([11045c2](https://github.com/miradorlabs/nodejs-sdk/commit/11045c2a2dad9d8c98941160cb5c0634b3dec770))
* add keepAlive option to prevent zombie timers on resumed traces ([8cdd7af](https://github.com/miradorlabs/nodejs-sdk/commit/8cdd7afbd9748ed0d860190aae329bb70164c6da))


### Bug Fixes

* remove unused variable to pass lint ([95a64a3](https://github.com/miradorlabs/nodejs-sdk/commit/95a64a361a16a12358ae986a01c2e14e785591e2))

## [1.5.0](https://github.com/miradorlabs/nodejs-sdk/compare/v1.4.0...v1.5.0) (2026-03-05)


### Features

* add flush method to sdk and deprecate create ([ff204d2](https://github.com/miradorlabs/nodejs-sdk/commit/ff204d268211ea0bab3b3e767a929f7eb3334a2a))
* add flush method to sdk and deprecate create ([fc8b33c](https://github.com/miradorlabs/nodejs-sdk/commit/fc8b33ccd8db4eae65ec033dc3e5f2605cb9929c))

## [1.4.0](https://github.com/miradorlabs/nodejs-sdk/compare/v1.3.0...v1.4.0) (2026-03-04)


### Features

* add safe msg hint functionality to sdk ([c70f028](https://github.com/miradorlabs/nodejs-sdk/commit/c70f02859eba48ad4cf77a91651a8453266abddd))
* add safe msg hint functionality to sdk ([9e5ed6c](https://github.com/miradorlabs/nodejs-sdk/commit/9e5ed6cfe17cbe496fd94ea0d64e0267498b6fd9))

## [1.3.0](https://github.com/miradorlabs/nodejs-sdk/compare/v1.2.0...v1.3.0) (2026-02-27)


### Features

* add cross-SDK trace ID sharing ([92853dc](https://github.com/miradorlabs/nodejs-sdk/commit/92853dc6d5a9a3c6a9f535144e3884038627ce88))
* add cross-SDK trace ID sharing ([894d8bc](https://github.com/miradorlabs/nodejs-sdk/commit/894d8bc885ef274f079ba1b4f74b5122affddb71))


### Bug Fixes

* prevent setTraceId from overriding an already-set trace ID ([f555766](https://github.com/miradorlabs/nodejs-sdk/commit/f555766cd2be68aff0c3c4401c9a7e698f8ed96a))

## [1.2.0](https://github.com/miradorlabs/nodejs-sdk/compare/v1.1.0...v1.2.0) (2026-02-25)


### Features

* add tx data capture, sendTransaction, and EIP-1193 provider ([1781e5f](https://github.com/miradorlabs/nodejs-sdk/commit/1781e5fc08b6aee32ddd00d0739e2421d08e2698))
* guard addTxInputData for empty data ([3b71a88](https://github.com/miradorlabs/nodejs-sdk/commit/3b71a88df7a0ac626517dda0dc3a26cfd4a2d328))
* tx metadata capture, sendTransaction, and EIP-1193 provider ([00f92d1](https://github.com/miradorlabs/nodejs-sdk/commit/00f92d11d26479caab6152d6d5dea6f8dfaf2c4f))


### Bug Fixes

* emit tx input data as event consistently ([6700f6a](https://github.com/miradorlabs/nodejs-sdk/commit/6700f6a24a81b628b6d93e48b59350326fee84f3))

## [1.1.0](https://github.com/miradorlabs/nodejs-sdk/compare/v1.0.0...v1.1.0) (2026-02-24)


### Features

* **txinput:** add tx input data method to trace sdk ([033fe0e](https://github.com/miradorlabs/nodejs-sdk/commit/033fe0efd9919759c6f326b837fe94ca2ceeff92))
* **txinput:** add tx input data method to trace sdk ([97bf54a](https://github.com/miradorlabs/nodejs-sdk/commit/97bf54ab57206ea7dcb61a77813d14ea00172500))
