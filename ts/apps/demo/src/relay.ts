// The relay popup entry: both /zk/x-popup (X, code in the query) and
// /auth/gmail/callback (Google, id_token in the fragment via the backend's
// static relay) are rewritten to this page. It bounces the provider
// callback to the parent on the libid_link channel and closes.

import { startRelay } from '@libid/claim'

const status = document.querySelector('#status')
if (status) startRelay(status)
