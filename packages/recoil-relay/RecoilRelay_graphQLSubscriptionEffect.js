/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 * @oncall recoil
 */

'use strict';

import type {EnvironmentKey} from './RecoilRelay_Environments';
import type {AtomEffect, RecoilState} from 'Recoil';
import type {Variables} from 'react-relay';
import type {GraphQLSubscription, IEnvironment} from 'relay-runtime';

const {getRelayEnvironment} = require('./RecoilRelay_Environments');
const {requestSubscription} = require('react-relay');
const recoverableViolation = require('recoil-shared/util/Recoil_recoverableViolation');

// TODO Use async atom support to set atom to error state.
// For now, log as a recoverableViolation() so errors aren't lost.
function logError<T>(node: RecoilState<T>, msg: string) {
  recoverableViolation(
    `Error syncing atom "${node.key}" with GraphQL: ${msg}`,
    'recoil',
  );
}

/** graphQLSubscriptionEffect()
 * Initialize and subscribe an atom to a GraphQL subscription.
 * - `environment`: The Relay Environment or an EnvironmentKey to match with
 *   the environment provided with `<RecoilRelayEnvironemnt>`.
 * - `subscription`: The GraphQL subscription to query.
 * - `variables`: Variables object provided as input to GraphQL subscription.
 *   If null, then skip subscription and use default value.
 * - `mapResponse`: Callback to map the subscription response to the atom value.
 */
function graphQLSubscriptionEffect<
  TVariables: Variables,
  TData: $ReadOnly<{[string]: mixed}>,
  T = TData,
  TRawResponse = void,
>({
  environment: environmentOpt,
  subscription,
  variables,
  mapResponse,
}: {
  environment: IEnvironment | EnvironmentKey,
  subscription: GraphQLSubscription<TVariables, TData, TRawResponse>,
  variables: TVariables | null,
  mapResponse: any => void,
}): AtomEffect<T> {
  return ({node, setSelf, trigger, storeID, parentStoreID_UNSTABLE}) => {
    if (variables == null) {
      return;
    }

    const environment = getRelayEnvironment(
      environmentOpt,
      storeID,
      parentStoreID_UNSTABLE,
    );

    let initialResolve, initialReject;
    if (trigger === 'get') {
      // setSelf(
      //   new Promise((resolve, reject) => {
      //     initialResolve = resolve;
      //     initialReject = reject;
      //   }),
      // );
    }

    // Subscribe to remote changes to update atom state
    const graphQLSubscriptionDisposable = requestSubscription(environment, {
      subscription,
      variables,
      updater: (store, response) => {
        const firstLevelKeys = Object.keys(response);
        const {action, ...rest} = response[firstLevelKeys[0]];
        const secondLevelKey = Object.keys(rest)[0];
        const data = rest[secondLevelKey];
        if (action === 'DELETE') {
          console.log('del-Action', action, data.id);
          store.delete(data.id);
          globalThis.source.delete(data.id);
        } else if (!globalThis.source.has(data.id)) {
          console.log('set-Action', action, data.id);
          globalThis.source.set(data.id, data);
        }
        return mapResponse(response, {setSelf, store});
      },
      // onNext: response =>{ },
      //  {
      // if (response != null) {
      // initialResolve?.(response);
      // mapResponse(response, {setSelf});
      // initialResolve?.(data);
      // setSelf(data);
      // }
      // },
      // TODO use Async atom support to set atom to error state on
      // subsequent errors during incremental updates.
      onError: error => {
        initialReject?.(error);
        logError(node, error.message ?? 'Error');
      },
    });

    return () => {
      graphQLSubscriptionDisposable.dispose();
    };
  };
}

module.exports = graphQLSubscriptionEffect;
