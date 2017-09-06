import { Observable } from 'rx';
import debugFactory from 'debug';
import dedent from 'dedent';

import { observeMethod, observeQuery } from '../utils/rx';
import { getSocialProvider } from '../utils/auth';

const debug = debugFactory('fcc:userIdent');

export default function({ models }) {
  const { User, UserIdentity, UserCredential } = models;
  const findUserById = observeMethod(User, 'findById');
  const findIdent = observeMethod(UserIdentity, 'findOne');

  UserIdentity.link = function(
    userId,
    provider,
    authScheme,
    profile,
    credentials,
    options = {},
    cb
  ) {
    if (typeof options === 'function' && !cb) {
      cb = options;
      options = {};
    }
    const user$ = findUserById(userId);
    const query = {
      where: {
        provider: getSocialProvider(provider),
        externalId: profile.id
      }
    };

    debug('link identity query', query);
    findIdent(query)
      .flatMap(identity => {
        const modified = new Date();
        if (!identity) {
          return observeQuery(UserIdentity, 'create', {
            provider: getSocialProvider(provider),
            externalId: profile.id,
            authScheme,
            profile,
            credentials,
            userId,
            created: modified,
            modified
          });
        }
        if (identity.userId.toString() !== userId.toString()) {
          return Observable.throw(
            new Error(
              dedent`
Your GitHub account is already linked to another Free Code Camp
account. To access it, <a href='/signout'>Sign out</a> of Free Code Camp, 
then sign in again using the "Sign in with GitHub" button.
              `.split('/n').join(' ')
            )
          );
        }
        identity.credentials = credentials;
        return observeQuery(identity, 'updateAttributes', {
          profile,
          credentials,
          modified
        });
      })
      .withLatestFrom(user$, (identity, user) => ({ identity, user }))
      .subscribe(
        ({ identity, user }) => {
          cb(null, user, identity);
        },
        cb
      );
  };

  UserCredential.link = UserIdentity.link.bind(UserIdentity);
}