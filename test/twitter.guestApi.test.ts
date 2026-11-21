import { afterEach, expect, test, vi } from 'vitest';
import { fetchByRestId } from '@fxembed/atmosphere/providers/twitter/conversation';
import type { TwitterBuildHost } from '@fxembed/atmosphere/providers/twitter/build-host';
import { app } from '../src/worker';
import { Strings } from '../src/strings';
import { botHeaders } from './helpers/data';
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
      const answer = respond(url);
      return answer instanceof Response ? answer : new Response(JSON.stringify(answer));
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

test('a rejected guest token is replaced and the request retried', async () => {
  const rejections = [
    new Response(JSON.stringify({ errors: [{ code: 239, message: 'Bad guest token' }] }), {
      status: 403
    }),
    new Response(JSON.stringify({ errors: [{ code: 88, message: 'Rate limit exceeded' }] }), {
      status: 429
    })
  ];
  const graphqlUrls = stubGuestApi(() => rejections.shift() ?? fixture);

  const response = await fetchByRestId('20', guestHost, false, undefined);

  expect(response.data?.tweetResult?.result).toEqual(fixture.data.tweetResult.result);
  expect(graphqlUrls).toHaveLength(3);
});

// Without the test harness's account proxy, the worker takes the guest API path.
const requestWithoutAccountProxy = (url: string) =>
  app.request(new Request(url, { method: 'GET', headers: botHeaders }), undefined, {});

test('a guest API failure embeds as an API error', async () => {
  stubGuestApi(() => ({ errors: [{ code: 88, message: 'Rate limit exceeded' }] }));

  const response = await requestWithoutAccountProxy('https://fxtwitter.com/jack/status/20');

  expect(await response.text()).toContain(Strings.ERROR_API_FAIL);
});

test('a missing guest post embeds as nonexistent', async () => {
  stubGuestApi(() => ({ data: { tweetResult: {} } }));

  const response = await requestWithoutAccountProxy('https://fxtwitter.com/jack/status/20');

  expect(await response.text()).toContain(Strings.ERROR_TWEET_NOT_FOUND);
});

test('a guest API failure answers the status API with 500', async () => {
  stubGuestApi(() => ({ errors: [{ code: 88, message: 'Rate limit exceeded' }] }));

  const response = await requestWithoutAccountProxy('https://api.fxtwitter.com/2/status/20');

  expect(response.status).toBe(500);
});
