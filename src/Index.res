@module("firebase/app") external firebase: 'a = "default"
@module("firebase/app") @new @scope(("default", "auth"))
external googleAuthProvider: unit => 'a = "GoogleAuthProvider"

@module("react-firebase-hooks/auth") external useAuthState: 'any = "useAuthState"

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

firebase["initializeApp"](firebaseConfig)

module App = {
  @react.component
  let make = () => {
    let (user, initializing, error) = useAuthState(firebase["auth"]())
    let user = user->Js.toOption

    React.useEffect1(() => {
      if !initializing {
        switch error {
        | Some(_) => ()
        | None =>
          switch user {
          | Some(_) => ()
          | None => {
              let provider = googleAuthProvider()
              firebase["auth"]()["signInWithPopup"](provider)
            }
          }
        }
      }

      None
    }, [user])

    if initializing {
      "initializing"->React.string
    } else {
      switch error {
      | Some(error) => error["toString"]()->React.string
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
| Some(app) => ReactDOM.render(<App />, app)
| None => ()
}
