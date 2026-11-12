"""Real Chromium visual/resource QA. Does not mutate game state.

Uses normal keyboard input with a virtual clock for travel. The reported rAF
intervals use real wall-clock scheduling in headless Chromium, not phone hardware.
"""
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import json
import statistics
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def state(page):
    return page.locator('html').get_attribute('data-game-state')


def is_art(url):
    return '/assets/art/' in url


def run():
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    origin = f'http://127.0.0.1:{server.server_port}'
    results = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
            for name, width, height, touch in [
                ('desktop', 1280, 720, False),
                ('phone-landscape', 844, 390, True),
                ('phone-portrait', 390, 844, True),
                ('tablet', 1024, 768, True),
            ]:
                context = browser.new_context(viewport={'width': width, 'height': height}, has_touch=touch, is_mobile=touch)
                page = context.new_page()
                errors, artwork_requests, bad_art = [], [], []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.on('request', lambda request: artwork_requests.append(request.url) if is_art(request.url) else None)
                page.on('response', lambda response: bad_art.append({'url': response.url, 'status': response.status}) if is_art(response.url) and response.status != 200 else None)
                page.goto(origin)
                page.wait_for_function("document.documentElement.dataset.gameState === 'Ready'")
                assert not page.locator('#startBtn').is_disabled()
                assert page.evaluate('Boolean(window.EmberScene?.ready)'), 'Full environment art not ready'
                assert page.evaluate('Boolean(window.EmberCharacters?.ready)'), 'Character sheet not ready'
                box = page.locator('#startBtn').bounding_box()
                assert box and box['x'] >= 0 and box['y'] >= 0 and box['y'] + box['height'] <= height, box
                assert any('scene-west.webp' in url for url in artwork_requests)
                assert any('scene-east.webp' in url for url in artwork_requests)
                assert any('characters.webp' in url for url in artwork_requests), artwork_requests
                page.screenshot(path=str(ROOT / 'tests' / f'visual-{name}-title.png'))
                ready_requests = len(artwork_requests)
                before = page.evaluate('performance.now()')
                page.locator('#startBtn').click()
                assert state(page) == 'Playing'
                elapsed = page.evaluate('performance.now()') - before
                assert page.locator('#overlay').is_hidden()
                assert len(artwork_requests) == ready_requests, 'Starting caused artwork network requests'

                # Measure actual wall-clock rAF cadence before enabling virtual clock.
                intervals = page.evaluate('''() => new Promise(resolve => {
                    const result=[]; let previous=performance.now();
                    const until=previous+1800;
                    function frame(now) {
                        result.push(now-previous); previous=now;
                        if(now<until) requestAnimationFrame(frame); else resolve(result.slice(1));
                    }
                    requestAnimationFrame(frame);
                })''')
                assert intervals
                page.clock.install()
                page.keyboard.down('KeyD')
                for i in range(10):
                    page.keyboard.press('KeyK')
                    page.keyboard.press('KeyR')
                    page.clock.run_for(400)
                    if i == 6:
                        page.keyboard.press('KeyF')
                page.keyboard.up('KeyD')
                assert state(page) == 'Playing'
                assert '废弃住宅' in page.locator('#zoneName').inner_text()
                page.screenshot(path=str(ROOT / 'tests' / f'visual-{name}-playing.png'))

                if name == 'desktop':
                    # Fresh page: install virtual time before play. Switching a running
                    # wall-time simulation to virtual time would skew travel durations.
                    page.close()
                    page=context.new_page()
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    page.on('request', lambda request: artwork_requests.append(request.url) if is_art(request.url) else None)
                    page.goto(origin)
                    page.wait_for_function("document.documentElement.dataset.gameState === 'Ready'")
                    assert page.evaluate('Boolean(window.EmberCharacters?.ready)')
                    replay_requests=len(artwork_requests)
                    page.clock.install()
                    page.locator('#startBtn').click()
                    page.keyboard.down('KeyD')
                    for i in range(26):
                        page.keyboard.press('KeyK')
                        page.keyboard.press('KeyR')
                        page.clock.run_for(400)
                        if i == 6:
                            page.keyboard.press('KeyF')
                    page.keyboard.up('KeyD')
                    page.keyboard.press('KeyF')
                    page.clock.run_for(20)  # Render the interaction result before capture.
                    page.screenshot(path=str(ROOT / 'tests' / 'visual-clinic.png'))
                    assert '安全撤离' in page.locator('#task').inner_text(), {'state':state(page),'zone':page.locator('#zoneName').inner_text(),'task':page.locator('#task').inner_text(),'hp':page.locator('#hpText').inner_text()}
                    page.keyboard.down('KeyA')
                    page.clock.run_for(10400)
                    page.keyboard.up('KeyA')
                    page.keyboard.press('KeyF')
                    assert state(page) == 'Completed'
                    page.locator('#startBtn').click()
                    page.clock.run_for(30)
                    assert state(page) == 'Playing'
                    assert len(artwork_requests) == replay_requests, 'Restart reloaded art'
                assert not errors, errors
                assert not bad_art, bad_art
                results.append({
                    'viewport': name,
                    'result': 'passed',
                    'art_requests_at_ready': ready_requests,
                    'start_ui_action_ms': round(elapsed, 1),
                    'headless_raf_median_ms': round(statistics.median(intervals), 2),
                    'headless_raf_p95_ms': round(sorted(intervals)[int(len(intervals) * .95)], 2),
                    'js_errors': errors,
                })
                context.close()

            context = browser.new_context()
            page = context.new_page()
            errors=[]
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.route('**/assets/art/**', lambda route: route.abort())
            page.goto(origin)
            page.wait_for_function("document.documentElement.dataset.gameState === 'Ready'")
            assert not page.evaluate('Boolean(window.EmberScene?.ready)')
            assert '基础画面' in page.locator('#loadStatus').inner_text()
            page.locator('#startBtn').click()
            assert state(page) == 'Playing'
            page.keyboard.press('KeyK')
            assert not errors, errors
            page.screenshot(path=str(ROOT / 'tests' / 'visual-art-fallback.png'))
            results.append({'case':'art-routes-blocked','result':'passed','js_errors':errors})
            context.close()
            browser.close()
    finally:
        server.shutdown()
    print(json.dumps(results, indent=2))

if __name__ == '__main__':
    run()
