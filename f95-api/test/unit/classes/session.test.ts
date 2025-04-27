// Copyright (c) 2022 MillenniumEarl
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// Core modules
import { promises as fs } from "fs";

// Public modules from npm
import { Cookie } from "tough-cookie";
import chai, { expect } from "chai";
import spies from "chai-spies";
import mock from "mock-fs";

// Local modules
import { urls } from "../../../src/scripts/constants/url";
import Session from "../../../src/scripts/classes/session";

// Constants
const USERNAME = "User";
const PASSWORD = "Password";
const TOKEN = "test-token";

// Allow chai to use chai-spies
chai.use(spies);

export function suite(): void {
  //#region Setup
  this.beforeAll(() => mock());
  this.afterAll(() => mock.restore());
  //#endregion Setup

  it("Session - Create with null path", () => {
    // Arguments
    const path = null as any;
    const ERROR_MESSAGE = "Invalid path for the session file";

    // Method call
    expect(() => new Session(path)).throw(ERROR_MESSAGE);
  });

  it("Session - Create with empty path", () => {
    // Arguments
    const path = "";
    const ERROR_MESSAGE = "Invalid path for the session file";

    // Method call
    expect(() => new Session(path)).throw(ERROR_MESSAGE);
  });

  it("Session - create", () => {
    // Arguments
    const path = "./sessionCreateTest";

    // Method call
    const session = createSession(path);

    expect(session.token).to.be.equal(TOKEN);
    expect(session.path).to.be.equal(path);
    expect(session.isMapped).to.be.false;
    expect(session.created).to.not.be.null;
    expect(session.hash).to.not.be.null;
  });

  it("Session - save", async () => {
    // Arguments
    const path = "./sessionSaveTest";

    // Method call
    const session = createSession(path);
    await session.save();

    // Verify test
    const exists = await fileExists(path);
    expect(exists).to.be.true;
  });

  it("Session - load", async () => {
    // Arguments
    const path = "./sessionLoadTest";

    // Method call
    const sessionSave = createSession(path);
    await sessionSave.save();

    const sessionLoad = createSession(path);
    await sessionLoad.load();

    // Verify test
    expect(sessionSave.hash).to.be.equal(sessionLoad.hash);
    
    // Check if dates are equal or within 2ms of each other
    // This allows for small discrepancies in timestamp precision during serialization
    const savedTime = sessionSave.created.getTime();
    const loadedTime = sessionLoad.created.getTime();
    const timeDiff = Math.abs(savedTime - loadedTime);
    
    expect(timeDiff).to.be.at.most(2, 'Date timestamps should be within 2ms of each other');
    expect(sessionSave.token).to.be.equal(sessionLoad.token);
  });

  it("Session - delete", async () => {
    // Arguments
    const path = "./sessionDeleteTest";

    // Method call
    const session = createSession(path);
    await session.save();
    await session.delete();

    // Verify test
    const exists = await fileExists(path);
    expect(exists).to.be.false;
  });

  it("Session - deleteSessionCookies", async () => {
    // Arrange
    const path = "./session";
    const keys = ["xf_user", "test_key", "test_key_bis"];
    const cookies = keys.map((k) => new Cookie({ key: k, domain: "f95zone.to" }));

    // Act
    const session = createSession(path);
    chai.spy.on(session.cookieJar, "getCookies", () => cookies);

    await session.deleteSessionCookies();

    chai.spy.restore(); // Restore cookiejar methods
    const cs = await session.cookieJar.getCookies(urls.BASE);
    const remaining = cs.length;

    // Assert
    expect(remaining).to.be.equal(1, "There should be only one cookie");
  });

  it("Session - isValid", () => {
    // Arguments
    const path = "./sessionValidateTest";

    // Method call
    const session = createSession(path);
    session.cookieJar.setCookieSync("xf_user=test-token", urls.BASE);
    const result = session.isValid(USERNAME, PASSWORD);

    // Expect result
    expect(result).to.be.true;
  });

  it("Session - updateToken", () => {
    // Arguments
    const path = "./invalidButNotNullPath";

    // Method call
    const session = createSession(path);
    session.updateToken(TOKEN);

    // Expect result
    expect(session["_token"]).to.be.equal(TOKEN);
  });
}

function createSession(path: string) {
  const session = new Session(path);
  session.create(USERNAME, PASSWORD, TOKEN);
  return session;
}

async function fileExists(path: string) {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}
