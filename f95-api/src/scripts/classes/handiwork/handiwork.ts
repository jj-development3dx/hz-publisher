// Copyright (c) 2022 MillenniumEarl
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// Modules from files
import { Handiwork } from "../../..";
import { DEFAULT_DATE } from "../../constants/generic";
import { IHandiwork } from "../../interfaces";
import { TEngine, TStatus } from "../../types";
import Basic from "./basic";

/**
 * It represents a generic work, be it a game, a comic, an animation or an asset.
 */
export default class HandiWork extends Basic implements IHandiwork {
  //#region Properties
  censored: boolean = false;
  engine: TEngine = "Ren'Py";
  genre: string[] = [];
  installation: string = "";
  language: string[] = [];
  lastRelease: Date = DEFAULT_DATE;
  os: string[] = [];
  status: TStatus = "Ongoing";
  version: string = "";
  pages: string = "";
  resolution: string[] = [];
  length: string = "";
  assetLink: string = "";
  associatedAssets: string[] = [];
  compatibleSoftware: string = "";
  includedAssets: string[] = [];
  officialLinks: string[] = [];
  sku: string = "";
  //#endregion Properties

  public constructor(init?: Partial<Handiwork>) {
    super();
    Object.assign(this, init);
  }
}
