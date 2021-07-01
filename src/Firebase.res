type auth

module Auth = {
  type t
  type provider

  @send external signInWithPopup: (t, provider) => unit = "signInWithPopup"

  @module("firebase/app") @new @scope(("default", "auth"))
  external googleAuthProvider: unit => provider = "GoogleAuthProvider"
}

@module("firebase/app") @scope("default") external auth: unit => Auth.t = "auth"

module Firestore = {
  type t
  type collection
  type document

  @send external collection: (t, string) => collection = "collection"
  @send external where: (collection, string, string, string) => collection = "where"
  @send external doc: (collection, string) => document = "doc"

  @send external update: (document, Js.t<'a>) => unit = "update"

  type batch
  @send external batch: t => batch = "batch"
  @send external addUpdate: (batch, document, Js.t<'a>) => unit = "update"
  @send external addSet: (batch, document, Js.t<'a>) => unit = "set"
  @send external addDelete: (batch, document) => unit = "delete"
  @send external commit: batch => unit = "commit"

  @module("firebase/app") @scope(("default", "firestore"))
  external setLogLevel: string => unit = "setLogLevel"

  type enablePersistenceResult
  type enablePersistenceError = {code: string}
  @send external enablePersistence: t => enablePersistenceResult = "enablePersistence"
  @send external catch: (enablePersistenceResult, enablePersistenceError => unit) => unit = "catch"
}

@module("firebase/app") @scope("default") external firestore: unit => Firestore.t = "firestore"

@module("firebase/app") @scope("default")
external initializeApp: {
  "apiKey": string,
  "authDomain": string,
  "databaseURL": string,
  "projectId": string,
  "storageBucket": string,
  "messagingSenderId": string,
  "appId": string,
  "measurementId": string,
} => unit = "initializeApp"
