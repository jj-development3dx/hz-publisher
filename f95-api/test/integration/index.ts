// Copyright (c) 2022 MillenniumEarl
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// Import suites
import { suite as login } from "./login.test";
import { suite as credentials } from "./classes/credentials.test";
import { suite as prefixParser } from "./classes/prefix-parser.test";
import { suite as handiworkfromurl } from "./handiwork-from-url.test";
import { suite as postparsetree } from "./scrape-data/post-parse-tree.test";
import { suite as fetchalert } from "./fetch-data/fetch-alert.test";
import { suite as platformuser } from "./classes/mapping/platform-user.test";
import { suite as fetchconversation } from "./fetch-data/fetch-conversation.test";

describe("Integration Tests", function testBasic() {
  //#region Set-up

  this.timeout(30000); // All tests in this suite get 30 seconds before timeout

  //#endregion Set-up

  describe("Test login", login.bind(this));
  describe("Test class Credentials", credentials.bind(this));
  describe("Test class PrefixParser", prefixParser.bind(this));
  describe("Test class PlatformUser", platformuser.bind(this));
  describe("Fetch handiwork from URL", handiworkfromurl.bind(this));
  describe("Test post parsing", postparsetree.bind(this));
  describe("Test alert parsing", fetchalert.bind(this));
  describe("Test conversation parsing", fetchconversation.bind(this));
});
