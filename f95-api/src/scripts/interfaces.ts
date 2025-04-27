// Copyright (c) 2022 MillenniumEarl
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

// Import types
import {
  TAuthor,
  TCategory,
  TChangelog,
  TRating,
  TEngine,
  TStatus,
  TQueryInterface,
  TAlertType,
  TAlertReactionType
} from "./types";

/**
 * Collection of values defined for each
 * handiwork on the F95Zone platform.
 */
export interface IBasic {
  /**
   * Authors of the work.
   */
  authors: TAuthor[];
  /**
   * Category of the work..
   */
  category: TCategory;
  /**
   * List of changes of the work for each version.
   */
  changelog: TChangelog[];
  /**
   * link to the cover image of the work.
   */
  cover: string;
  /**
   * Unique ID of the work on the platform.
   */
  id: number;
  /**
   * Last update of the opening thread.
   */
  lastThreadUpdate: Date;
  /**
   * Plain name of the work (without tags and/or prefixes)
   */
  name: string;
  /**
   * Work description
   */
  overview: string;
  /**
   * List of prefixes associated with the work.
   */
  prefixes: string[];
  /**
   * Evaluation of the work by the users of the platform.
   */
  rating: TRating;
  /**
   * List of tags associated with the work.
   */
  tags: string[];
  /**
   * Date of publication of the thread associated with the work.
   */
  threadPublishingDate: Date;
  /**
   * URL to the work's official conversation on the F95Zone portal.
   */
  url: string;
}

/**
 * Collection of values representing a game present on the F95Zone platform.
 */
export interface IGame extends IBasic {
  /**
   * Specify whether the work has censorship
   * measures regarding NSFW scenes
   */
  censored: boolean;
  /**
   * Graphics engine used for game development.
   */
  engine: TEngine;
  /**
   * List of genres associated with the work.
   */
  genre: string[];
  /**
   * Author's Guide to Installation.
   */
  installation: string;
  /**
   * List of available languages.
   */
  language: string[];
  /**
   * Last time the work underwent updates.
   */
  lastRelease: Date;
  /**
   * List of OS for which the work is compatible.
   */
  os: string[];
  /**
   * Indicates the progress of a game.
   */
  status: TStatus;
  /**
   * Version of the work.
   */
  version: string;
}

/**
 * Collection of values representing a comic present on the F95Zone platform.
 */
export interface IComic extends IBasic {
  /**
   * List of genres associated with the work.
   */
  genre: string[];
  /**
   * Number of pages or elements that make up the work.
   */
  pages: string;
  /**
   * List of resolutions available for the work.
   */
  resolution: string[];
}

/**
 * Collection of values representing an animation present on the F95Zone platform.
 */
export interface IAnimation extends IBasic {
  /**
   * Specify whether the work has censorship
   * measures regarding NSFW scenes
   */
  censored: boolean;
  /**
   * List of genres associated with the work.
   */
  genre: string[];
  /**
   * Author's Guide to Installation.
   */
  installation: string;
  /**
   * List of available languages.
   */
  language: string[];
  /**
   * Length of the animation.
   */
  length: string;
  /**
   * Number of pages or elements that make up the work.
   */
  pages: string;
  /**
   * List of resolutions available for the work.
   */
  resolution: string[];
}

/**
 * Collection of values representing an asset present on the F95Zone platform.
 */
export interface IAsset extends IBasic {
  /**
   * External URL of the asset.
   */
  assetLink: string;
  /**
   * List of URLs of assets associated with the work
   * (for example same collection).
   */
  associatedAssets: string[];
  /**
   * Software compatible with the work.
   */
  compatibleSoftware: string;
  /**
   * List of assets url included in the work or used to develop it.
   */
  includedAssets: string[];
  /**
   * List of official links of the work, external to the platform.
   */
  officialLinks: string[];
  /**
   * Unique SKU value of the work.
   */
  sku: string;
}

/**
 * Collection of values extrapolated from the
 * F95 platform representing a particular work.
 */
export interface IHandiwork extends IGame, IComic, IAnimation, IAsset {}

export interface IQuery {
  /**
   * Name of the implemented interface.
   */
  itype: TQueryInterface;
  /**
   * Category of items to search among.
   */
  category: TCategory;
  /**
   * Tags to be include in the search.
   */
  includedTags: string[];
  /**
   * Tags to exclude from the search.
   */
  excludedTags: string[];
  /**
   * Prefixes to include in the search.
   */
  includedPrefixes: string[];
  /**
   * Index of the page to be obtained.
   * Between 1 and infinity.
   */
  page: number;
  /**
   * Search with the data in the query and returns the result.
   *
   * If the query is invalid it throws an exception.
   */
  execute(): any;
}

/**
 * It represents an object that obtains the data
 * only on the explicit request of the user and
 * only after its establishment.
 */
export interface ILazy {
  /**
   * Gets the data relating to the object.
   */
  fetch(): Promise<void>;
}

/**
 * Represents a single alert message received by the currently logged in user.
 */
export interface IAlert {
  /**
   * Type of alert.
   */
  type: TAlertType;
  /**
   * ID of the user that caused this alert.
   */
  userid: number;
  /**
   * URL linked to this alert (may be a post, a thread...).
   */
  linkedURL: string;
  /**
   * If `type` is `Reaction`, define the reaction otherwise is `null`.
   */
  reaction: TAlertReactionType;
  /**
   * When this alert was raised.
   */
  date: Date;
  /**
   * True if the alert has been read.
   */
  read: boolean;
}

/**
 * Represents a single thread followed by the currently logged in user..
 */
export interface IWatchedThread {
  /**
   * URL of the thread.
   */
  url: string;
  /**
   * Indicates whether the thread has any unread posts.
   */
  unread: boolean;
  /**
   * Specifies the forum to which the thread belongs.
   */
  forum: string;
}

/**
 * Represents a single post saved as a favorite by the currently logged in user..
 */
export interface IBookmarkedPost {
  /**
   * ID of the post.
   */
  id: number;
  /**
   * ID of the user that wrote this post.
   */
  userid: number;
  /**
   * When this post was saved.
   */
  savedate: Date;
  /**
   * Description of the post.
   */
  description: string;
  /**
   * List of user-defined labels for the post.
   */
  labels: string[];
}

export interface IConversation {
  /**
   * Conversation's URL.
   */
  url: string;
  /**
   * Title of the conversation.
   */
  title: string;
  /**
   * ID of the user that starts this conversation.
   */
  authorid: number;
  /**
   * Date of creation (first message).
   */
  creation: Date;
  /**
   * IDs of the recipients of this conversation.
   */
  lastRecipients: number[];
  /**
   * Total number of replies.
   */
  replies: number;
  /**
   * Total number of partecipants.
   */
  partecipants: number;
  /**
   * ID of the last user to reply.
   */
  lastResponseUser: number;
  /**
   * Date of the last reply message.
   */
  lastResponseTime: Date;
  /**
   * `True` if there are unread messages.
   */
  unread: boolean;
  /**
   * Messages exchanged by users.
   */
  //messages: IMessage[];
}

/**
 * Represents an element contained in the post.
 */
export interface IPostElement {
  /**
   * Type of element.
   */
  type: "Root" | "Empty" | "Text" | "Link" | "Image" | "Spoiler";
  /**
   * Name associated with the element.
   */
  name: string;
  /**
   * Text of the content of the element excluding any children.
   */
  text: string;
  /**
   * Children elements contained in this element.
   */
  content: IPostElement[];
}

/**
 * Represents a link type link in the post.
 */
export interface ILink extends IPostElement {
  type: "Image" | "Link";
  /**
   * Link to the resource.
   */
  href: string;
}
