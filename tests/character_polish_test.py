"""Character motion/grounding regression in real Chromium's software WebGL.

The standalone component harness calls only the renderer's public API and reads
its diagnostics. Pixel grounding checks inspect the actual transparent framebuffer,
not only the positions of bones. This is not a mobile GPU benchmark.
"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json
import math
import os
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ARGS = ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']

class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def angle_distance(a, b):
    return abs(math.atan2(math.sin(a - b), math.cos(a - b)))


def quaternion_distance(a, b):
    dot = min(1.0, abs(sum(x * y for x, y in zip(a, b))))
    return 2 * math.acos(dot)


def distance(a, b):
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))


def finite_numbers(value):
    if isinstance(value, dict):
        return all(finite_numbers(v) for v in value.values())
    if isinstance(value, list):
        return all(finite_numbers(v) for v in value)
    return not isinstance(value, (int, float)) or math.isfinite(value)


def main():
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    origin = f'http://127.0.0.1:{server.server_port}'
    results = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=ARGS)
            context = browser.new_context(viewport={'width': 1200, 'height': 900})
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(origin + '/tests/')
            page.set_content('''<html><body style="margin:0;background:#161d19;color:#c7c9b6;font:14px monospace">
                <canvas id="board" width="1200" height="900"></canvas>
                <canvas id="actor" width="600" height="450" hidden></canvas></body></html>''')
            assert page.evaluate('''async origin => {
                await import(origin + '/assets/characters-3d.js');
                return await Ember3DCharacters.load();
            }''', origin)
            page.evaluate('''() => {
                let time = 0;
                window.polishGround = () => {
                    const image = document.querySelector('#actor').getContext('2d').getImageData(0, 0, 600, 450);
                    let count = 0, maxY = 360;
                    for (let y = 366; y < 450; y++) for (let x = 0; x < 600; x++) {
                        const i = (y * 600 + x) * 4, data = image.data;
                        if (Math.abs(data[i] - 64) + Math.abs(data[i + 1] - 71) + Math.abs(data[i + 2] - 54) > 12) {
                            count++; maxY = y;
                        }
                    }
                    return {pixelsBelowMargin: count, maxPenetrationPixels: count ? maxY - 360 : 0};
                };
                window.renderPolish = ({frames = 1, state = {}, cell = null, label = ''}) => {
                    const canvas = document.querySelector('#actor'), c = canvas.getContext('2d');
                    const actor = {id: 'player', x: 200, y: 240, face: 1, walk: 0, moving: false,
                        crouch: false, run: false, isEnemy: false, type: 0, dead: false,
                        attackTimer: 0, shootTimer: 0, hurtTimer: 0, hitFlash: 0, alert: false, ...state};
                    for (let i = 0; i < frames; i++) {
                        time += 1 / 60; actor.time = time; actor.walk += .14;
                        c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#202923'; c.fillRect(0, 0, 600, 450);
                        c.setTransform(1.5, 0, 0, 1.5, 0, 0); c.fillStyle = '#404736'; c.fillRect(0, 240, 400, 60);
                        Ember3DCharacters.beginFrame({viewWidth: 400, height: 300, cam: 0,
                            width: 600, heightPixels: 450, dpr: 1, dt: 1 / 60});
                        Ember3DCharacters.submit(actor); Ember3DCharacters.flush(c);
                    }
                    if (cell !== null) {
                        const b = document.querySelector('#board').getContext('2d');
                        const x = (cell % 2) * 600, y = Math.floor(cell / 2) * 450;
                        b.drawImage(canvas, x, y); b.fillStyle = '#e6dcc1'; b.font = '15px monospace';
                        b.fillText(label, x + 20, y + 28);
                    }
                    return Ember3DCharacters.inspect().actors.find(a => a.id === actor.id);
                };
            }''')

            probe = os.environ.get('POLISH_PROBE')
            if probe:
                page.evaluate('renderPolish({frames:1})')
                state = {'crouch': True} if probe == 'crouch' else {'dead': True} if probe == 'corpse' else {'shootTimer': .3}
                sample = page.evaluate('(args)=>renderPolish({frames:50,state:args.state,cell:0,label:args.label})', {'state': state, 'label': probe})
                grounding = page.evaluate('polishGround()')
                page.screenshot(path=str(ROOT / 'tests' / f'polish-{probe}-probe.png'))
                print(json.dumps({'probe': probe, 'snapshot': sample, 'ground': grounding}, indent=2))
                context.close(); browser.close()
                return

            idle = page.evaluate('renderPolish({frames:45, cell:0, label:"Idle"})')
            assert finite_numbers(idle), idle
            assert idle['motion']['move'] < .15, idle['motion']
            walk = page.evaluate('renderPolish({frames:45, state:{moving:true}, cell:1, label:"Walk"})')
            assert walk['motion']['move'] > .85, walk['motion']
            first_stop = page.evaluate('renderPolish({state:{moving:false,crouch:true,face:-1}})')
            assert .01 < first_stop['motion']['move'] < 1, first_stop['motion']
            assert 0 < first_stop['motion']['crouch'] < 1, first_stop['motion']
            target_yaw = -math.pi / 2
            assert angle_distance(first_stop['facingYaw'], target_yaw) > .05, 'Facing snapped instantly'
            samples = [walk, first_stop]
            for _ in range(12):
                samples.append(page.evaluate('renderPolish({state:{crouch:true,face:-1}})'))
            max_leg_step = max(quaternion_distance(a['bones']['RightUpLeg'], b['bones']['RightUpLeg'])
                               for a, b in zip(samples, samples[1:]))
            assert max_leg_step < .65, {'single_frame_leg_change_radians': max_leg_step}
            settled = page.evaluate('renderPolish({frames:28,state:{crouch:true,face:-1}})')
            assert settled['motion']['move'] < .15 and settled['motion']['crouch'] > .85, settled['motion']
            assert angle_distance(settled['facingYaw'], target_yaw) < .3, settled['facingYaw']
            results.append({'case': 'smooth-stop-crouch-turn', 'result': 'passed',
                            'first': first_stop['motion'], 'settled': settled['motion'], 'max_leg_step_radians': max_leg_step})

            # Compare matching facing/idle states so torso drop is isolated.
            standing = page.evaluate('renderPolish({frames:40})')
            crouch = page.evaluate('renderPolish({frames:45,state:{crouch:true},cell:2,label:"Crouch / pack follows"})')
            chest_drop = standing['world']['chest'][1] - crouch['world']['chest'][1]
            pack_drop = standing['world']['backpack'][1] - crouch['world']['backpack'][1]
            assert chest_drop > 10, {'chest_drop': chest_drop}
            assert pack_drop > chest_drop * .65, {'chest_drop': chest_drop, 'pack_drop': pack_drop}
            assert abs(pack_drop - chest_drop) < 10, {'chest_drop': chest_drop, 'pack_drop': pack_drop}
            crouch_ground = page.evaluate('polishGround()')
            if crouch_ground['pixelsBelowMargin']:
                page.screenshot(path=str(ROOT / 'tests' / 'polish-ground-failure.png'))
            assert crouch_ground['pixelsBelowMargin'] == 0, {'ground': crouch_ground, 'pose': crouch}
            aim = page.evaluate('renderPolish({frames:40,state:{shootTimer:.30},cell:3,label:"Two-hand aim"})')
            hand_distance = distance(aim['world']['leftHand'], aim['world']['rightHand'])
            assert hand_distance < 23, hand_distance
            assert any(word in aim['gearMode'].lower() for word in ['gun', 'pistol', 'firearm']), aim['gearMode']
            page.screenshot(path=str(ROOT / 'tests' / 'polish-poses-board.png'))
            results.append({'case': 'crouch-pack-grounding-two-hand-aim', 'result': 'passed',
                            'chest_drop': chest_drop, 'pack_drop': pack_drop,
                            'crouch_ground': crouch_ground, 'aim_hand_distance': hand_distance})

            corpse = page.evaluate('renderPolish({frames:70,state:{dead:true},cell:0,label:"Settled corpse"})')
            corpse_ground = page.evaluate('polishGround()')
            assert corpse_ground['pixelsBelowMargin'] == 0, corpse_ground
            assert corpse['motion']['death'] > .9, corpse['motion']
            infected = page.evaluate('renderPolish({frames:35,state:{id:"infected",isEnemy:true,moving:true,alert:true},cell:1,label:"Infected"})')
            melee = page.evaluate('renderPolish({frames:40,state:{attackTimer:.42},cell:2,label:"Knife / melee"})')
            assert any(word in melee['gearMode'].lower() for word in ['knife', 'blade', 'melee']), melee['gearMode']
            crouch_walk = page.evaluate('renderPolish({frames:45,state:{crouch:true,moving:true},cell:3,label:"Crouch movement"})')
            page.screenshot(path=str(ROOT / 'tests' / 'polish-actions-board.png'))
            assert all(finite_numbers(s) for s in [idle, walk, first_stop, settled, crouch, aim, corpse, infected, melee, crouch_walk])
            assert page.evaluate('Ember3DCharacters.stats.actorCount') <= 8
            page.evaluate('Ember3DCharacters.dispose()')
            assert page.evaluate('Ember3DCharacters.stats.actorCount') == 0
            assert not errors, errors
            results.append({'case': 'corpse-melee-finite-bones-and-release', 'result': 'passed',
                            'corpse_ground': corpse_ground, 'melee_gear': melee['gearMode'], 'js_errors': errors})
            context.close(); browser.close()
    finally:
        server.shutdown()
    print(json.dumps({'scope': 'headless Chromium / SwiftShader, not mobile hardware', 'results': results}, indent=2))

if __name__ == '__main__':
    main()
