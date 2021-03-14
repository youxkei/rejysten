@module("firebase/app") external firebase: 'a = "default"
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

    React.useEffect(() => {
      if !initializing {
        switch error {
        | Some(_) => ()
        | None =>
          switch user {
          | Some(_) => ()
          | None => {
              let provider = %raw(`new App.auth.GoogleAuthProvider()`)
              firebase["auth"]()["signInWithPopup"](provider)
            }
          }
        }
      }

      None
    })

    if initializing {
      <span> initializing </span>
    } else {
      switch error {
      | Some(error) => <span> {error["toString"]()->React.string} </span>
      | None =>
        switch user {
        | Some(_) => <Document document={"NdxNjoPpHTuFjfhRDUth"} />
        | None => <span> {"logging in"->React.string} </span>
        }
      }
    }
  }
}

switch ReactDOM.querySelector("#app") {
| Some(app) => ReactDOM.render(<App />, app)
| None => ()
}
