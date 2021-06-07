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

Firebase.initializeApp(firebaseConfig)

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
    ->KeyDownMiddleware.middleware(store, _),
  (),
)

module KeyDownHandler = {
  @react.component
  let make = React.memo(() => {
    let dispatch = Redux.useDispatch()

    React.useEffect1(() => {
      let listener = event => dispatch(Action.KeyDown({event: event}))

      window->addEventListener("keydown", listener)

      None
    }, [])

    React.null
  })

  React.setDisplayName(make, "KeyDownHandler")
}

module App = {
  @react.component
  let make = () => {
    let (user, initializing, error) = useAuthState(Firebase.auth())
    let user = user->Js.toOption
    let focus = Redux.useSelector(State.focus)

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
        | Some(_) =>
          <main className=Style.app>
            {switch focus {
            | State.DocumentPane
            | State.DocumentItemPane => <> <DocumentPane /> <DocumentItemPane /> </>

            | State.SearchPane => <SearchPane />
            }}
          </main>

        | None => "logging in"->React.string
        }
      }
    }
  }
}

switch ReactDOM.querySelector("#app") {
| Some(app) =>
  ReactDOM.render(
    <Redux.Provider store>
      {<> <App /> <SyncDocumentItemPaneState /> <SyncDocumentPaneState /> <KeyDownHandler /> </>}
    </Redux.Provider>,
    app,
  )

| None => ()
}
