import { afterEach, expect, test, vi } from 'vitest';
import { fetchByRestId } from '@fxembed/atmosphere/providers/twitter/conversation';
import type { TwitterBuildHost } from '@fxembed/atmosphere/providers/twitter/build-host';
import fixture from './mocks/TweetResultByRestId/20.json';

afterEach(() => {
  vi.unstubAllGlobals();
});

// No account proxy or credential key, so requests take the guest API path.
const guestHost: TwitterBuildHost = { t: key => key };

const stubGuestApi = (respond: (url: URL) => unknown) => {
  const graphqlUrls: URL[] = [];
  // Miniflare's cache rejects the guest token request's `cf` options, so skip the token cache.
  vi.stubGlobal('caches', undefined);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.pathname.endsWith('/guest/activate.json')) {
        return new Response(JSON.stringify({ guest_token: '1' }));
      }
      graphqlUrls.push(url);
      return new Response(JSON.stringify(respond(url)));
    })
  );
  return graphqlUrls;
};

test('a cached guest miss is confirmed past the edge cache', async () => {
  const graphqlUrls = stubGuestApi(url =>
    url.searchParams.has('_') ? fixture : { data: { tweetResult: {} } }
  );

  const response = await fetchByRestId('20', guestHost, false, undefined);

  expect(response.data?.tweetResult?.result).toEqual(fixture.data.tweetResult.result);
  expect(graphqlUrls.map(url => url.searchParams.has('_'))).toEqual([false, true]);
});

test('a found guest post is served from the edge cache', async () => {
  const graphqlUrls = stubGuestApi(() => fixture);

  await fetchByRestId('20', guestHost, false, undefined);

  expect(graphqlUrls.map(url => url.searchParams.has('_'))).toEqual([false]);
});

test('a missing guest post stays missing after one confirmation', async () => {
  const graphqlUrls = stubGuestApi(() => ({ data: { tweetResult: {} } }));

  const response = await fetchByRestId('20', guestHost, false, undefined);

  expect(response.data?.tweetResult).toEqual({});
  expect(graphqlUrls).toHaveLength(2);
});
