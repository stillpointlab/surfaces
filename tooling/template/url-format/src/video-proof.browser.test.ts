// A proof, not kept: a `<video>` plays a 1 s WebM of the package, with sound and
// no gesture, and reports its size. dev/media/clip.webm was made by
//   ffmpeg -f lavfi -i testsrc2=size=160x90:rate=24:duration=1 \
//     -f lavfi -i sine=frequency=440:duration=1 \
//     -c:v libvpx-vp9 -b:v 150k -c:a libopus -b:a 32k -shortest dev/media/clip.webm
import { afterEach, expect, it } from 'vitest';

const clip = new URL('../dev/media/clip.webm', import.meta.url).href;

/** The first of `events` the media fires, by name; an `error` rejects. */
function next(media: HTMLMediaElement, ...events: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const done = (event: Event) => {
      for (const name of events) media.removeEventListener(name, done);
      media.removeEventListener('error', failed);
      resolve(event.type);
    };
    const failed = () =>
      reject(new Error(`media error ${media.error?.code}: ${media.error?.message}`));
    for (const name of events) media.addEventListener(name, done, { once: true });
    media.addEventListener('error', failed, { once: true });
  });
}

afterEach(() => document.body.replaceChildren());

it('plays a 1 s WebM from the package, with sound and no gesture, and reports its size', async () => {
  const video = document.createElement('video');
  video.preload = 'auto';
  video.src = clip;
  document.body.append(video);

  await next(video, 'loadedmetadata');
  expect([video.videoWidth, video.videoHeight]).toEqual([160, 90]);
  expect(video.duration).toBeGreaterThan(0.9);
  expect(video.duration).toBeLessThan(1.1);

  // Unmuted: without the autoplay switch, play() rejects with NotAllowedError.
  expect(video.muted).toBe(false);
  const ended = next(video, 'ended');
  await video.play();
  await ended;

  expect(video.ended).toBe(true);
  expect(video.currentTime).toBeGreaterThan(0.9);
  console.log(
    `played ${clip.split('/').pop()}: ${video.videoWidth}×${video.videoHeight}, ${video.duration.toFixed(3)} s`
  );
});
