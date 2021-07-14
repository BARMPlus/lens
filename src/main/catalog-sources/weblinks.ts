/**
 * Copyright (c) 2021 OpenLens Authors
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import { computed, observable, reaction } from "mobx";
import { WeblinkStore } from "../../common/weblink-store";
import { WebLink } from "../../common/catalog-entities";
import { catalogEntityRegistry } from "../catalog";
import got from "got";
import type { Disposer } from "../../common/utils";

async function validateLink(link: WebLink) {
  try {
    const response = await got.get(link.spec.url, {
      throwHttpErrors: false,
      timeout: 20_000,
    });

    if (response.statusCode >= 200 && response.statusCode < 500) {
      link.status.phase = "available";
    } else {
      link.status.phase = "unavailable";
    }
  } catch {
    link.status.phase = "unavailable";
  }
}


export function syncWeblinks() {
  const weblinkStore = WeblinkStore.getInstance();
  const webLinkEntities = observable.map<string, [WebLink, Disposer]>();

  function periodicallyCheckLink(link: WebLink): Disposer {
    validateLink(link);

    const timeout = setTimeout(() => validateLink(link), 10 * 60 * 1000); // every 10 minutes

    return () => {
      clearTimeout(timeout);
    };
  }

  reaction(() => weblinkStore.weblinks, (links) => {
    const seenWeblinks = new Set<string>();

    for (const weblinkData of links) {
      seenWeblinks.add(weblinkData.id);

      if (!webLinkEntities.has(weblinkData.id)) {
        const link = new WebLink({
          metadata: {
            uid: weblinkData.id,
            name: weblinkData.name,
            source: "local",
            labels: {}
          },
          spec: {
            url: weblinkData.url
          },
          status: {
            phase: "available",
            active: true
          }
        });

        webLinkEntities.set(weblinkData.id, [
          link,
          periodicallyCheckLink(link),
        ]);
      }
    }
  }, {fireImmediately: true});

  catalogEntityRegistry.addComputedSource("weblinks", computed(() => Array.from(webLinkEntities.values(), ([link]) => link)));
}
