# How to run the mobile app in the iOS Simulator (Expo Go vs dev build, staying on SDK 54)

Research for issue #54 (child of map #53). Researched 2026-10-13.

## Recommendation

**Use a local development build (`npx expo run:ios`) and stay on SDK 54 for now.** Before the first build, fix two dependency problems. One of them stops the JS bundle from building at all.

```bash
# 1. Dependency fixes (from apps/mobile)
cd apps/mobile
npx expo install expo-network              # -> ~8.0.8; @better-auth/expo imports it; bundling fails without it
npx expo install --fix                     # worklets 0.8.3 -> 0.5.1, expo -> ~54.0.37, expo-constants -> ~18.0.14
cd ../..

# 2. Build + install the dev client on the iOS 26.3 simulator, start Metro
npm --workspace=@postpilot/mobile run ios -- --device "iPhone 17 Pro"
#   (= npx expo run:ios from apps/mobile; first run prebuilds ios/ and runs pod install)

# 3. Day to day (JS-only changes): no rebuild needed
npm run mobile        # expo start --clear; defaults to dev-client mode because expo-dev-client is installed
# press i -> opens the already-installed PostPilot dev build in the simulator

# Rebuild only after native changes (new native dep, app.json plugin/config change, SDK bump):
cd apps/mobile && npx expo prebuild --clean && npx expo run:ios
```

Also fix `apps/mobile/.gitignore`. It ignores `.ios/` and `.android/`, which have leading dots and are wrong. Replace them with `/ios` and `/android`, otherwise the generated native project shows up as untracked (CNG: native dirs stay generated and are not committed).

Why not Expo Go: it can still be made to work for SDK 54 on the simulator, but it requires the same dependency fixes. On top of that, sign-in will most likely fail. Inside Expo Go, `@better-auth/expo` sends an `exp://<lan-ip>:8081` origin, and the server (`apps/web/src/server/auth.ts`) only trusts `postpilot://`. Expo Go also bypasses the `postpilot://` scheme and any native config. The dev build matches what we ship.

## (a) Expo Go and SDK support as of Oct 2026

| SDK | RN | React | Expo Go (simulator build in Expo's versions API) | Min Xcode |
| --- | --- | --- | --- | --- |
| 54 | 0.81 | 19.1.0 | iOS 54.0.7, Android 54.0.8 | 16.1+ |
| 55 | 0.83 | 19.2.0 | 55.0.34 | 26.2+ |
| 56 | 0.85 | 19.2.3 | 56.0.4 | 26.4+ |
| 57 (latest stable, Jun 30 2026) | 0.86 | 19.2.3 | 57.0.9 | 26.4+ |
| 58 (beta since Sep 15 2026) | 0.88 rc | — | 58.0.2 | — |

- **App Store Expo Go is on SDK 57 now.** It was updated around Sep 3, 2026 and now requires login on device, though not on simulators ([changelog: login now required](https://expo.dev/changelog/expo-go-57-login)). From SDK 55 to 57 it was stuck on SDK 54 while Apple approval was pending ([Expo Go and the App Store, May 2026](https://expo.dev/changelog/expo-go-and-app-store-may-2026)). So a physical iPhone can no longer run an SDK 54 project in the store Expo Go.
- **The simulator can still run SDK 54 in Expo Go.** Older Expo Go builds "can be installed on the iOS simulator through Expo CLI or from expo.dev/go" (same May 2026 post). I checked this directly:
  - `https://api.expo.dev/v2/versions/latest` still lists `sdkVersions["54.0.0"].iosClientUrl = …/Expo-Go-54.0.7.tar.gz`, and that URL resolves (HTTP 200, ~65 MB).
  - `@expo/cli` 54.0.25 (`start/platforms/ExpoGoInstaller.js`) reads `iosClientVersion` for the project's SDK and offers to install that build on the simulator when you press `i` in Expo Go mode.
- SDK table and Xcode minimums are from [docs.expo.dev/versions/latest](https://docs.expo.dev/versions/latest/).
- Expo's official position is that Expo Go is "first and foremost an educational tool" and development builds are recommended for real apps (May 2026 post; [SDK 57 changelog](https://expo.dev/changelog/sdk-57)). SDK 54 gets critical fixes until the next SDK release (SDK 57 changelog), so it is now effectively in maintenance.

## (b) What `expo-dev-client` does to `expo start`

- With `expo-dev-client` in `package.json`, `expo start` defaults to **development-build mode**. Pressing `i` tries to open the installed PostPilot dev client, not Expo Go ([Expo Go to dev build guide](https://docs.expo.dev/develop/development-builds/expo-go-to-dev-build/)). In the CLI code, `@expo/cli` `start/detectDevClient.js` checks `dependencies['expo-dev-client']`.
- To use Expo Go instead, either run `npx expo start --go` (`-g`) or press **`s`** in the running CLI to toggle between "development build" and "Expo Go" (`start/interface/startInterface.js`, `case 's'`). `--dev-client` and `--go` cannot be combined.
- So the current `npm run mobile` (`expo start --clear`) does nothing useful in the simulator until a dev build is installed. Press `s` and it switches to Expo Go, which then fails on the issues listed below.

## (c) What `npx expo run:ios` needs here, and the gotchas

Toolchain on this machine: Xcode **27.0** (27A266a, iOS 27.0 SDK), only the **iOS 26.3** simulator runtime installed, CocoaPods **1.16.2**, Node 22.17.

What `run:ios` does: it runs `expo prebuild` if `ios/` is missing, runs `pod install`, compiles with Xcode, installs on the simulator, and starts Metro ([local app development](https://docs.expo.dev/guides/local-app-development/)). No Expo account or Apple Developer membership is needed for the simulator.

Findings, from blocking to cosmetic:

1. **BLOCKER: `expo-network` is missing, so the JS bundle fails.** `npx expo export -p ios` fails with `Unable to resolve module expo-network from node_modules/@better-auth/expo/dist/client.js`. `@better-auth/expo` 1.6.19 does `import("expo-network")` and declares it as an *optional* peer, so npm never installed it. Metro still resolves the literal `import()` at build time. This affects Expo Go and dev builds alike. Fix: `npx expo install expo-network` (SDK 54 expects `~8.0.8`). It's a native module, so install it *before* the first `run:ios`. There may be further bundle errors after this one: the export stopped at the first failure.
2. **`react-native-worklets@0.8.3` vs SDK 54's expected `0.5.1`.** `expo install --check` and `expo-doctor` both flag it.
   - **In a dev build it would technically work.** Reanimated 4.1.7's own `compatibility.json` lists worklets `0.5.x – 0.8.x` for 4.1.x, its peer range is `react-native-worklets: "0.5 - 0.8"`, and worklets 0.8.x supports RN 0.81–0.85. Even so, it's an untested combination for SDK 54.
   - **In Expo Go it is a hard failure.** Expo Go 54 ships native worklets 0.5.1, and worklets' `checkCppVersion` throws `Mismatch between JavaScript part and native part of Worklets (0.8.3 vs 0.5.1)` in `__DEV__` on any major or minor difference.
   - Fix: `npx expo install --fix`, which pins `0.5.1` (still inside Reanimated 4.1's supported range). Nothing in the repo needs 0.8 (`^0.8.0` came in with the initial commit).
3. **Xcode 27 is newer than anything SDK 54 was tested against** (minimum is 16.1). Known risks:
   - *fmt `consteval` errors on Xcode ≥ 26.4* ([expo/expo#44229](https://github.com/expo/expo/issues/44229)). Commenters say SDK 54 is also affected, but only when React Native is built from source. RN 0.81 never got an fmt fix (last patch 0.81.6, Feb 2026). The SDK 54 Podfile template sets `RCT_USE_RN_DEP=1` and `RCT_USE_PREBUILT_RNCORE=1` whenever new arch is on and `ios.buildReactNativeFromSource` isn't set. We are on new arch, so we get **prebuilt RN core and deps, and fmt is not compiled.** Do **not** set `buildReactNativeFromSource: true`. If it does show up, the Podfile `post_install` patch in that issue is the workaround.
   - Third-party pods (Reanimated, worklets, screens, gesture-handler, svg, safe-area) still compile from source with the new clang. This is untested on Xcode 27. If they fail, the fallback is to install Xcode 26.x side by side and build with `DEVELOPER_DIR=/Applications/Xcode-26.x.app/Contents/Developer npx expo run:ios`.
   - *iOS 27 runtime.* Apps built with the iOS 27 SDK must adopt the UIKit scene life cycle to launch **on iOS 27**. Expo only added opt-in support in SDK 57 (`expo@57.0.23`, `expo-build-properties` `ios.enableSceneSupport`) per the SDK 57 changelog. **Keep running SDK 54 builds on the iOS 26.3 simulators** (installed) and don't target an iOS 27 simulator.
4. **Monorepo and hoisting are fine for native.**
   - The SDK 54 template Podfile resolves `expo` and `react-native` with `node --print "require.resolve(...)"`, so hoisting to the root `node_modules` works.
   - There is exactly one `react`, `react-native`, `reanimated` and `worklets` in the tree. React 19.1.0 is shared with the Next 15 web app.
   - Duplicate React or RN copies are the main monorepo failure mode ([monorepo guide](https://docs.expo.dev/guides/monorepos/)).
5. **Metro config is redundant, but this is not a blocker.** Since SDK 52, `expo/metro-config` configures monorepos automatically, and the docs say to remove manual `watchFolders` / `resolver.nodeModulesPaths` (monorepo guide). `expo-doctor` flags `watchFolders`. Optional cleanup: drop both and keep `withNativeWind`. Don't set `unstable_enablePackageExports = false`, because Better Auth requires package exports ([Better Auth Expo docs](https://www.better-auth.com/docs/integrations/expo)).
6. **Babel.** `babel-preset-expo` (SDK 54) already auto-adds `react-native-worklets/plugin` when worklets is installed, so the explicit `'react-native-reanimated/plugin'` in `babel.config.js` is redundant. The bundler got past Babel without errors, so this is low priority.
7. **`expo-doctor` also flags `eas-cli` as a project devDependency.** Expo recommends running it with `npx` or installing it globally instead. This is cosmetic.
8. **`.gitignore`**: `.ios/` and `.android/` should be `/ios` and `/android` (see above).

`expo-doctor` summary (2026-10-13): 15/18 checks passed. The 3 failures are the Metro `watchFolders` override, `eas-cli` installed locally, and the version mismatches (worklets 0.8.3 vs 0.5.1, expo 54.0.35 vs ~54.0.37, expo-constants 18.0.13 vs ~18.0.14).

## Why Expo Go is not the path (even though the simulator can run SDK 54)

- It needs the same `expo-network` and worklets fixes anyway.
- **Auth.** Under Expo Go, `Linking.createURL` produces `exp://<ip>:8081`. `@better-auth/expo` sends that as the `expo-origin` header, and the server's `trustedOrigins` only contains `AUTH_URL` and `postpilot://`. Email sign-in (the only method in `app/signin.tsx`) will most likely be rejected as an untrusted origin, unless dev-only `exp://` wildcards are added server-side (the Better Auth docs show this, gated on `NODE_ENV === "development"`).
- It's a dead end on devices: store Expo Go is SDK 57 and requires login. Expo is also steering everyone to dev builds.
- It still works as a quick JS-only fallback: `npx expo start --go`, press `i`, accept the prompt to install Expo Go 54.0.7, add `exp://` to `trustedOrigins` in dev.

## (d) What upgrading to the latest SDK (57) would cost

Upgrade command: `npx expo install expo@^57.0.0 --fix && npx expo-doctor@latest`, then `prebuild --clean` and a new dev build. You can't jump straight to 57 without picking up the 55 and 56 breaking changes along the way.

- **SDK 55** ([changelog](https://expo.dev/changelog/sdk-55)): legacy architecture removed and the `newArchEnabled` key removed from `app.json` (we're already on new arch, so we just delete the key). Packages are renumbered to `55.x`. Xcode 26 minimum. `autolinkingModuleResolution` is on by default in monorepos. Hermes v1 is not recommended for Android in monorepos.
- **SDK 56** ([changelog](https://expo.dev/changelog/sdk-56)):
  - `expo-router` no longer depends on `react-navigation`. A codemod exists. We import nothing from `@react-navigation/*` directly, so impact should be low.
  - iOS minimum goes to 16.4. Xcode minimum is 26.4 (we have 27). Node minimum is 20.19.4 (we have 22.17).
  - TypeScript bumps to 6.0.3.
  - `expo/fetch` becomes the global `fetch`. This could affect the tRPC and Better Auth clients, so retest auth cookies.
  - Hermes v1 becomes the default, with a known memory regression with worklets/Reanimated that is fixed in 57.
- **SDK 57** ([changelog](https://expo.dev/changelog/sdk-57)): RN 0.86, intended to be non-breaking. Reanimated 4.5 and worklets 0.10. The Xcode 27 / iOS 27 scene life cycle is opt-in here.
- **React 19.2.3.** The monorepo hoists a single React that the Next.js web app (react `^19.1.0`) shares. Mobile on 19.2.3 means bumping web's `react`/`react-dom` to 19.2.x in lockstep (or adding npm `overrides`), otherwise there will be duplicate Reacts. This is a cross-app change.
- **NativeWind is the riskiest piece.**
  - The stable line is 4.2.7 (css-interop 0.2.7, peer `react-native-reanimated >=3.6.2`, Tailwind 3). I found nothing confirming that v4 is validated on RN 0.85/0.86.
  - NativeWind **v5 is still `5.0.0-rc.0`**, targeted at SDK 57. It's a new engine (`react-native-css`) and needs Tailwind v4, so it's a real migration ([v5 migration guide](https://www.nativewind.dev/v5/guides/migrate-from-v4)).
- **`@better-auth/expo`** (1.7.7 latest, open-ended `>=` peers on expo packages) is low risk.
- **Rough cost:** about 1–2 days, including web React bump, NativeWind verification or migration, an auth/fetch retest, and a dev-build rebuild. Most of that is NativeWind risk, so it belongs in its own ticket.

Since the store Expo Go no longer runs SDK 54, staying on 54 is only viable with dev builds. That's fine for the simulator today. Plan the upgrade (likely to SDK 57, or 58 once it's stable) as separate work, possibly together with the NativeWind v5 decision.

## Sources

- Expo SDK reference and version tables: https://docs.expo.dev/versions/latest/
- Expo Go and the App Store, May 2026: https://expo.dev/changelog/expo-go-and-app-store-may-2026
- Expo Go login requirement (store build now SDK 57): https://expo.dev/changelog/expo-go-57-login
- SDK 55 / 56 / 57 changelogs: https://expo.dev/changelog/sdk-55 · https://expo.dev/changelog/sdk-56 · https://expo.dev/changelog/sdk-57
- Expo Go to development build: https://docs.expo.dev/develop/development-builds/expo-go-to-dev-build/
- Local app development (`run:ios`): https://docs.expo.dev/guides/local-app-development/
- Monorepos: https://docs.expo.dev/guides/monorepos/
- Expo versions API (Expo Go client URLs per SDK): https://api.expo.dev/v2/versions/latest
- fmt / Xcode 26.4 issue: https://github.com/expo/expo/issues/44229
- Better Auth Expo integration: https://www.better-auth.com/docs/integrations/expo
- NativeWind v5 migration: https://www.nativewind.dev/v5/guides/migrate-from-v4
- Local evidence: `react-native-reanimated/compatibility.json` (4.1.7), `react-native-worklets/src/debug/checkCppVersion.ts`, `expo/bundledNativeModules.json`, `@expo/cli` `start/detectDevClient.js` + `start/platforms/ExpoGoInstaller.js`, `expo/template.tgz` Podfile, `npx expo install --check`, `npx expo-doctor`, `npx expo export -p ios`.
