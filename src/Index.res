@val external window: Dom.window = "window"
@send
external addEventListener: (Dom.window, string, Dom.keyboardEvent => unit) => unit =
  "addEventListener"

@module("react-firebase-hooks/auth") external useAuthState: 'any = "useAuthState"
@send external toString: Js.t<'a> => string = "toString"

%%raw(`
  import "firebase/firestore";
  import "firebase/auth";
`)

let firebaseConfig = {
  "apiKey": "AIzaSyBibda14rl7kYHvJJPyqxXYkL-FnnbpIKk",
  "authDomain": "rejysten.firebaseapp.com",
  "databaseURL": "https://rejysten.firebaseio.com",
  "projectId": "rejysten",
  "storageBucket": "rejysten.appspot.com",
  "messagingSenderId": "720104133648",
  "appId": "1:720104133648:web:5f1f29ef3ae4916cdae695",
  "measurementId": "G-64RW992RRF",
}

exception PersistenceNotSupported

Firebase.initializeApp(firebaseConfig)
Firebase.firestore()
->Firebase.Firestore.enablePersistence
->Firebase.Firestore.catch(err => {
  if err.code == "failed-precondition" {
    Js.log("Multiple tabs open, persistence can only be enabled in one tab at a a time.")
  } else if err.code == "unimplemented" {
    raise(PersistenceNotSupported)
  }
})

let loggerMiddleware = (store, next, action) => {
  Js.log(Reductive.Store.getState(store))
  Js.log(action)
  next(action)
  Js.log(Reductive.Store.getState(store))
}

let enhancer = ReductiveDevTools.Connectors.enhancer(
  ~options=ReductiveDevTools.Extension.enhancerOptions(~name="rejysten", ()),
  ~devToolsUpdateActionCreator=state => Action.DevToolUpdate({state: state}),
  (),
)

let store = enhancer(Reductive.Store.create)(
  ~reducer=Reducer.reducer,
  ~preloadedState=State.initialState,
  ~enhancer=(store, next) =>
    next
    ->loggerMiddleware(store, _)
    ->FirestoreMiddleware.middleware(store, _)
    ->EventMiddleware.middleware(store, _),
  (),
)

module KeyDownHandler = {
  @react.component
  let make = React.memo(() => {
    let dispatch = Redux.useDispatch()

    React.useEffect1(() => {
      let listener = event => dispatch(Action.Event(Event.KeyDown({event: event})))

      window->addEventListener("keydown", listener)

      None
    }, [])

    React.null
  })

  React.setDisplayName(make, "KeyDownHandler")
}

module Main = {
  @react.component
  let make = () => {
    let focus = Redux.useSelector(State.focus)

    switch focus {
    | State.Note(_) => <> <Note /> <SyncNoteState /> </>

    | State.Search() => <> <Search /> <SyncSearchState /> </>

    | State.ActionLog(_) => <> <ActionLog /> <SyncActionLogState /> </>
    }
  }
}

module App = {
  @react.component
  let make = () => {
    let (user, initializing, error) = useAuthState(Firebase.auth())
    let user = user->Js.toOption

    React.useEffect1(() => {
      if !initializing {
        switch error {
        | Some(_) => ()

        | None =>
          switch user {
          | Some(_) => ()

          | None =>
            let provider = Firebase.Auth.googleAuthProvider()
            Firebase.auth()->Firebase.Auth.signInWithPopup(provider)
          }
        }
      }

      None
    }, [user, initializing])

    if initializing {
      "initializing"->React.string
    } else {
      switch error {
      | Some(error) => error->toString->React.string
      | None =>
        switch user {
        | Some(_) => <> <Main /> <SyncFirestoreState /> </>

        | None => "logging in"->React.string
        }
      }
    }
  }
}

switch ReactDOM.querySelector("#app") {
| Some(app) =>
  ReactDOM.render(<Redux.Provider store> {<> <App /> <KeyDownHandler /> </>} </Redux.Provider>, app)

| None => ()
}
