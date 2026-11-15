# threejs-fps-02

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/Alro07/threejs-fps-02/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/Alro07/threejs-fps-02/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

DUSTLINE — a round-based, Counter-Strike-style tactical FPS in three.js. You attack with four VANGUARD bots against five EMBER defenders on a dusk freight yard with two bomb sites (A · Refinery, B · Silo), three lanes and a mid sightline. Rounds end by elimination, charge detonation, defuse or time; first to 5 rounds takes the match. Between rounds you spend earned money in a buy menu: four guns (pistol, SMG, rifle, sniper), frag grenades and armor. Gunplay rewards stopping to aim — recoil and spread punish firing on the move, headshots deal triple damage, crouching and cover matter, and bots follow waypoint routes, hold sites, react to gunfire they hear, and rush to defuse a planted charge. Everything runs offline from static files: no build step, no network requests, sounds synthesised with WebAudio.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in a desktop browser with WebGL 2. Click to play: WASD to move, mouse to look, click to fire, R to reload, Ctrl to crouch, Space to jump, B for the buy menu, 1–4 for weapons, G to throw a frag grenade, hold E on a site to plant the charge.

---

<sub>Entered on [make.fun](https://make.fun/?ref=4mj7kn2k&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
