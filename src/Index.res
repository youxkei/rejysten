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
  Js.log(action)
  next(action)
}

let store = Reductive.Store.create(
  ~reducer=Action.reducer,
  ~preloadedState=State.initialState,
  ~enhancer=(store, next) => next->loggerMiddleware(store, _)->Action.firestoreReducer(store, _),
  (),
)

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
          | None => {
              let provider = Firebase.Auth.googleAuthProvider()
              Firebase.auth()->Firebase.Auth.signInWithPopup(provider)
            }
          }
        }
      }

      None
    }, [user])

    let {
      mode,
      item: {currentId: currentItemId, map: itemsMap},
      document: {currentId: currentDocumentId, map: documentsMap},
    } = Redux.useSelector(State.state)

    if initializing {
      "initializing"->React.string
    } else {
      switch error {
      | Some(error) => error->toString->React.string
      | None =>
        switch user {
        | Some(_) => <> <Document mode currentItemId itemsMap currentDocumentId documentsMap /> </>
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
      {<> <App /> <SyncItemsMap /> <SyncDocumentsMap /> <KeyDownHandler /> </>}
    </Redux.Provider>,
    app,
  )
| None => ()
}
