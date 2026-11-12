"""Real Chromium/WebGL checks for locally loaded skeletal 3D characters.

The renderer component harness calls its public render API; it never changes
internal game state. App checks use actual UI and keyboard events. Chromium may
use SwiftShader, so these checks do not establish real mobile GPU performance.
"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
GL_ARGS = ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def model_request(url):
    return '/assets/models/' in url or '/assets/vendor/' in url or 'characters-3d.js' in url


def wait_ready(page):
    page.wait_for_function("document.documentElement.dataset.gameState === 'Ready'", timeout=35000)
    assert not page.locator('#startBtn').is_disabled()


def main():
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    origin = f'http://127.0.0.1:{server.server_port}'
    results = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=GL_ARGS)
            for name, width, height, touch in [
                ('desktop', 1280, 720, False),
                ('phone', 844, 390, True),
                ('tablet', 1024, 768, True),
            ]:
                context = browser.new_context(viewport={'width':width, 'height':height}, has_touch=touch, is_mobile=touch)
                page = context.new_page()
                errors, requests, failed = [], [], []
                page.on('pageerror', lambda e: errors.append(str(e)))
                page.on('request', lambda request: requests.append(request.url) if model_request(request.url) else None)
                page.on('response', lambda response: failed.append({'url':response.url,'status':response.status}) if model_request(response.url) and response.status != 200 else None)
                page.goto(origin)
                wait_ready(page)
                assert page.evaluate('Boolean(window.Ember3DCharacters?.ready)'), '3D renderer did not initialize'
                assert any(url.lower().endswith('.glb') for url in requests), requests
                ready_requests = len(requests)
                page.screenshot(timeout=60000, path=str(ROOT/'tests'/f'3d-{name}-title.png'))
                page.clock.install()
                page.locator('#startBtn').click()
                assert page.locator('#shelterHUD').is_visible()
                page.keyboard.down('KeyD')
                page.clock.run_for(650)
                page.keyboard.up('KeyD')
                stats = page.evaluate('window.Ember3DCharacters.stats')
                assert stats['enabled'], stats
                assert stats['visibleActors'] >= 1 and stats['drawCalls'] > 0 and stats['triangles'] > 0, stats
                assert stats['actorCount'] <= 8, stats
                assert len(requests) == ready_requests, 'Start/movement fetched model resources'
                page.screenshot(timeout=60000, path=str(ROOT/'tests'/f'3d-{name}-shelter.png'))
                for _ in range(3):
                    page.locator('#pauseBtn').click()
                    assert page.locator('html').get_attribute('data-game-state') == 'Paused'
                    page.locator('#startBtn').click()
                page.clock.run_for(100)
                assert page.evaluate('window.Ember3DCharacters.stats.actorCount') <= 8
                assert not errors, errors
                assert not failed, failed
                results.append({'viewport':name, 'result':'passed', 'stats':stats, 'model_requests_at_ready':ready_requests, 'js_errors':errors})
                context.close()

            # An isolated component page proves genuine GLB skinning and poses.
            context = browser.new_context(viewport={'width':960,'height':540})
            page = context.new_page(); errors=[]
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.goto(origin+'/tests/')
            page.set_content('<html><body style="margin:0;background:#18201c"><canvas id="component" width="960" height="540"></canvas></body></html>')
            assert page.evaluate('''async origin => {
                await import(origin+'/assets/characters-3d.js');
                return await window.Ember3DCharacters.load();
            }''', origin)
            harness = '''({frames, phase=0, stress=false}) => {
                const api=window.Ember3DCharacters;
                const canvas=document.querySelector('#component'), c=canvas.getContext('2d');
                for(let frame=0;frame<frames;frame++){
                    c.setTransform(1,0,0,1,0,0);c.fillStyle='#18201c';c.fillRect(0,0,960,540);
                    c.setTransform(.75,0,0,.75,0,0);c.fillStyle='#343b2e';c.fillRect(0,575,1280,145);
                    api.beginFrame({viewWidth:1280,height:720,cam:0,width:960,heightPixels:540,dpr:1,dt:1/60});
                    for(let i=0;i<(stress?30:8);i++){
                        api.submit({id:i===0?'player':'test-'+i,x:70+i*155,y:575,face:1,time:phase+frame/60,
                            walk:phase+frame*.14,moving:i===1||i===2||i===7,run:i===2,crouch:i===3,
                            isEnemy:i===7,type:i===7?1:0,dead:i===6,attackTimer:i===5?.42:0,
                            shootTimer:i===4?.3:0,hurtTimer:0,hitFlash:0,alert:i===7});
                    }
                    api.flush(c);
                }
                return api.stats;
            }'''
            first = page.evaluate(harness, {'frames':1})
            assert first['visibleActors'] == 8 and first['triangles'] > 0, first
            before = page.evaluate('window.Ember3DCharacters.inspect?.().actors.find(actor=>actor.id==="test-1") ?? null')
            assert before is not None, 'Renderer needs a read-only skeleton inspect method'
            page.evaluate(harness, {'frames':19, 'phase':.1})
            after = page.evaluate('window.Ember3DCharacters.inspect?.().actors.find(actor=>actor.id==="test-1") ?? null')
            assert after['clipTime'] > before['clipTime'], 'AnimationMixer time did not advance'
            assert json.dumps(before['bones'], sort_keys=True) != json.dumps(after['bones'], sort_keys=True), 'Actual skeleton bone transforms did not change'
            page.screenshot(timeout=60000, path=str(ROOT/'tests'/'3d-component-poses.png'))
            stressed = page.evaluate(harness, {'frames':1, 'phase':.3, 'stress':True})
            assert stressed['actorCount'] <= 8 and stressed['visibleActors'] <= 8, stressed
            page.evaluate('window.Ember3DCharacters.dispose()')
            disposed = page.evaluate('window.Ember3DCharacters.stats')
            assert not page.evaluate('window.Ember3DCharacters.ready')
            assert disposed['actorCount'] == 0, disposed
            assert not errors, errors
            results.append({'case':'real-skeletal-component-poses-and-bounded-pool','result':'passed','initial_stats':first,'stressed_stats':stressed,'disposed_stats':disposed})
            context.close()

            # Model failure must preserve playable sprite characters.
            context=browser.new_context();page=context.new_page();errors=[]
            page.on('pageerror',lambda e:errors.append(str(e)))
            page.route('**/assets/models/**',lambda route:route.abort())
            page.goto(origin);wait_ready(page)
            assert not page.evaluate('Boolean(window.Ember3DCharacters?.ready)')
            assert page.evaluate('Boolean(window.EmberCharacters?.ready)')
            page.locator('#startBtn').click();assert page.locator('#shelterHUD').is_visible()
            page.screenshot(timeout=60000, path=str(ROOT/'tests'/'3d-model-failure-fallback.png'))
            assert not errors,errors
            results.append({'case':'blocked-glb-fallback','result':'passed','js_errors':errors})
            context.close();browser.close()

            browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-webgl','--disable-webgl2'])
            context=browser.new_context();page=context.new_page();errors=[]
            page.on('pageerror',lambda e:errors.append(str(e)))
            page.goto(origin);wait_ready(page)
            assert not page.evaluate('Boolean(window.Ember3DCharacters?.ready)')
            assert page.evaluate('Boolean(window.EmberCharacters?.ready)')
            page.locator('#startBtn').click();assert page.locator('#shelterHUD').is_visible()
            page.screenshot(timeout=60000, path=str(ROOT/'tests'/'3d-no-webgl-fallback.png'))
            assert not errors,errors
            results.append({'case':'webgl-disabled-fallback','result':'passed','js_errors':errors})
            context.close();browser.close()
    finally:
        server.shutdown()
    print(json.dumps({'gpu_scope':'headless Chromium with SwiftShader; not real mobile hardware','results':results},indent=2))

if __name__ == '__main__':
    main()
