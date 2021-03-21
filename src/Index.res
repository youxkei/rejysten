@module("react-firebase-hooks/auth") external useAuthState: 'any = "useAuthState"
@send external toString: Js.t<'a> => string = "toString"

@get external keyCode: Dom.keyboardEvent => int = "keyCode"

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

    let cursor = Recoil.useRecoilValue(Atom.cursor)

    Hook.useKeyDown(event => {
      switch cursor {
      | Cursor({editing: false}) => {
          let keyCode = event->keyCode
          Js.log(keyCode)
        }
      | _ => ()
      }
    }, [cursor])

    if initializing {
      "initializing"->React.string
    } else {
      switch error {
      | Some(error) => error->toString->React.string
      | None =>
        switch user {
        | Some(_) => <Document document={"NdxNjoPpHTuFjfhRDUth"} />
        | None => "logging in"->React.string
        }
      }
    }
  }
}

switch ReactDOM.querySelector("#app") {
| Some(app) => ReactDOM.render(<Recoil.RecoilRoot> <App /> </Recoil.RecoilRoot>, app)
| None => ()
}
