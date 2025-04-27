// Copyright (c) 2022 MillenniumEarl
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// Public module from npm
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { USER_NOT_LOGGED } from "../../../../src/scripts/classes/errors";

// Module from files
import { UserProfile } from "../../../../src";
import Shared from "../../../../src/scripts/shared";

chai.use(chaiAsPromised);
const { expect } = chai;

export function suite(): void {
  it("Fetch profile without authentication", async function fetchWithoutAuth() {
    Shared.setIsLogged(false);
    const up = new UserProfile();
    await expect(up.fetch()).to.be.rejectedWith(USER_NOT_LOGGED);
  });
}
