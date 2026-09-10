import test from 'node:test';
import assert from 'node:assert/strict';
const cards = await import('../web/src/artwork-card.ts').catch(error => { if (error.code === 'ERR_MODULE_NOT_FOUND') return {}; throw error; });

test('a card includes only explicitly chosen public fields and no private release destination', () => {
  assert.equal(typeof cards.cardFields, 'function');
  assert.deepEqual(cards.cardFields({ name: '', author: '', note: '' }), { name: '', author: '', note: '' });
  assert.throws(() => cards.cardFields({ name: 'public', author: '', note: '', workspace: 'PRIVATE_TEST' }));
  assert.throws(() => cards.cardFields({ name: 'hidden\u0000text', author: '', note: '' }));
  const text = cards.appearancePostText('公開する作品');
  assert.match(text, /公開する作品/); assert.equal(text.includes('http'), false);
  const intent = new URL(cards.xIntent(text, null));
  assert.equal(intent.origin, 'https://x.com'); assert.equal(intent.pathname, '/intent/tweet');
  assert.deepEqual([...intent.searchParams.keys()], ['text']);
  assert.equal(intent.searchParams.get('text'), text);
});

test('post length counts Japanese, combined emoji and the final public link with the official rules', () => {
  assert.equal(typeof cards.postLength, 'function');
  assert.equal(cards.postLength('あ'.repeat(140), null).valid, true);
  assert.equal(cards.postLength('あ'.repeat(141), null).valid, false);
  assert.equal(cards.postLength('👨‍👩‍👧‍👦', null).weightedLength, 2);
  const url = 'https://example.com/public-release';
  assert.equal(cards.postLength('a'.repeat(256), url).weightedLength, 280);
  assert.throws(() => cards.xIntent('a'.repeat(257), url));
  assert.throws(() => cards.xIntent('public', 'http://127.0.0.1:9000/private'));
  const intent = new URL(cards.xIntent('公開文 & 改行\n#Unharness', url));
  assert.equal(intent.searchParams.get('text'), '公開文 & 改行\n#Unharness');
  assert.equal(intent.searchParams.get('url'), url);
});
