module Auth = {
  type t
  type provider

  @module("firebase/auth")
  external signInWithPopup: (t, provider) => unit = "signInWithPopup"
  @module("firebase/auth")
  external signInWithRedirect: (t, provider) => unit = "signInWithRedirect"

  @module("firebase/auth") @new
  external googleAuthProvider: unit => provider = "GoogleAuthProvider"
}

module Firestore = {
  type t
  type collection
  type document
  type fieldPath

  @module("firebase/firestore") @new
  external fieldPath1: string => fieldPath = "FieldPath"
  @module("firebase/firestore") @new
  external fieldPath2: (string, string) => fieldPath = "FieldPath"
  @module("firebase/firestore") @new
  external fieldPath3: (string, string, string) => fieldPath = "FieldPath"

  @module("firebase/firestore") external collection: (t, string) => collection = "collection"
  @module("firebase/firestore") external doc: (collection, string) => document = "doc"

  @module("firebase/firestore") external update: (document, Js.t<'a>) => unit = "updateDoc"
  @module("firebase/firestore")
  external updateField: (document, fieldPath, 'a) => unit = "updateDoc"

  type writeBatch
  @module("firebase/firestore") external writeBatch: t => writeBatch = "writeBatch"
  @send external addUpdate: (writeBatch, document, Js.t<'a>) => unit = "update"
  @send external addUpdateField: (writeBatch, document, fieldPath, 'a) => unit = "update"
  @send external addSet: (writeBatch, document, Js.t<'a>) => unit = "set"
  @send external addDelete: (writeBatch, document) => unit = "delete"
  @send external commit: writeBatch => unit = "commit"

  type enableMultiTabIndexedDbPersistenceResult
  type enableMultiTabIndexedDbPersistenceError = {code: string}
  @module("firebase/firestore")
  external enableMultiTabIndexedDbPersistence: t => enableMultiTabIndexedDbPersistenceResult =
    "enableMultiTabIndexedDbPersistence"
  @send
  external catch: (
    enableMultiTabIndexedDbPersistenceResult,
    enableMultiTabIndexedDbPersistenceError => unit,
  ) => unit = "catch"
}

type t

@module("firebase/app")
external initializeApp: {
  "apiKey": string,
  "authDomain": string,
  "databaseURL": string,
  "projectId": string,
  "storageBucket": string,
  "messagingSenderId": string,
  "appId": string,
  "measurementId": string,
} => t = "initializeApp"

@module("firebase/auth") external getAuth: t => Auth.t = "getAuth"
@module("firebase/firestore") external getFirestore: t => Firestore.t = "getFirestore"

let firebaseApp = initializeApp({
  "apiKey": "AIzaSyBibda14rl7kYHvJJPyqxXYkL-FnnbpIKk",
  "authDomain": "rejysten.firebaseapp.com",
  "databaseURL": "https://rejysten.firebaseio.com",
  "projectId": "rejysten",
  "storageBucket": "rejysten.appspot.com",
  "messagingSenderId": "720104133648",
  "appId": "1:720104133648:web:5f1f29ef3ae4916cdae695",
  "measurementId": "G-64RW992RRF",
})

let auth = firebaseApp->getAuth
let firestore = firebaseApp->getFirestore

exception PersistenceNotSupported
firestore
->Firestore.enableMultiTabIndexedDbPersistence
->Firestore.catch(err => {
  if err.code == "failed-precondition" {
    Js.log("The app is already open in another browser tab and multi-tab is not enabled.")
  } else if err.code == "unimplemented" {
    raise(PersistenceNotSupported)
  }
})
