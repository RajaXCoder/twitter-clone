const express = require('express')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const path = require('path')

const app = express()
app.use(express.json())

const dbPath = path.join(__dirname, 'twitterClone.db')

let db
const initDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () =>
      console.log('Server Running at >>> http://localhost:3000'),
    )
  } catch (err) {
    console.log(`Db Error : ${err.message}`)
    process.exit(-1)
  }
}

initDbAndServer()

app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body

  const userDetailsQuery = `
    SELECT *
    FROM user
    WHERE username = "${username}";`

  const userDetails = await db.get(userDetailsQuery)

  if (userDetails === undefined) {
    if (password.length < 6) {
      response.status(400)
      response.send('Password is too short')
    } else {
      const encryptPassword = await bcrypt.hash(password, 12)
      const addUserQuery = `
        INSERT INTO 
        user (name, username, password, gender)
        VALUES("${name}", "${username}", "${encryptPassword}", "${gender}");`

      await db.run(addUserQuery)
      response.send('User created successfully')
    }
  } else {
    response.status(400)
    response.send('User already exists')
  }
})

app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const userDetailsQuery = `
    SELECT *
    FROM user
    WHERE username = "${username}";`

  const userDetails = await db.get(userDetailsQuery)
  console.log(userDetails)

  if (userDetails === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isCorrectPassword = await bcrypt.compare(
      password,
      userDetails.password,
    )
    if (isCorrectPassword === true) {
      const payload = {username: username}
      const jwtToken = jwt.sign(payload, 'Raju')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

const authentication = (request, response, next) => {
  const authHeader = request.headers['authorization']
  let jwtToken

  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }

  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'Raju', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = payload.username
        //get userId
        const getUserId = `SELECT user_id FROM user WHERE username = "${payload.username}";`
        const userId = await db.get(getUserId)
        request.userId = userId.user_id
        //get all user list
        const getUserList = `SELECT * FROM user`
        const userList = await db.all(getUserList)
        request.userList = userList
        next()
      }
    })
  }
}

app.get('/user/tweets/feed/', authentication, async (request, response) => {
  const {userId} = request
  const getTweetQuery = `
  SELECT *
  FROM tweet
  INNER JOIN follower ON tweet.user_id = follower.following_user_id 
  INNER JOIN user ON tweet.user_id = user.user_id
  WHERE follower.follower_user_id =${userId}
  ORDER BY tweet.date_time DESC
  LIMIT 4;`

  const tweets = await db.all(getTweetQuery)
  // response.send(tweets)
  // console.log(tweets)
  response.send(
    tweets.map(each => {
      return {
        username: each.username,
        tweet: each.tweet,
        dateTime: each.date_time,
      }
    }),
  )
})

app.get('/user/following/', authentication, async (request, response) => {
  const {userId} = request
  const getFollowingIdQuery = `
  SELECT user.name
  FROM follower
  INNER JOIN user ON follower.following_user_id = user.user_id
  WHERE follower.follower_user_id = ${userId};
;`

  const followerIdList = await db.all(getFollowingIdQuery)

  response.send(followerIdList)
})

app.get('/user/followers/', authentication, async (request, response) => {
  const {userId} = request
  const getFollowingIdQuery = `
  SELECT user.name
  FROM follower
  INNER JOIN user ON follower.follower_user_id = user.user_id
  WHERE follower.following_user_id = ${userId};`

  const followerIdList = await db.all(getFollowingIdQuery)

  response.send(followerIdList)
})

const followingUser = async (request, response, next) => {
  const {userId} = request
  const {tweetId} = request.params
  const getTweetQuery = `
  SELECT tweet_id
  FROM tweet
  JOIN follower ON tweet.user_id = following_user_id
  WHERE follower_user_id = ${userId};`

  const tweetuserId = await db.all(getTweetQuery)
  // console.log(tweetuserId)

  if (tweetuserId !== []) {
    const checkFollowingUser = tweetuserId.some(
      each => each.tweet_id === parseInt(tweetId),
    )
    if (checkFollowingUser === true) {
      next()
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  } else {
    response.status(401)
    response.send('Invalid Request')
  }
}

app.get(
  '/tweets/:tweetId/',
  authentication,
  followingUser,
  async (request, response) => {
    const {userId} = request
    const {tweetId} = request.params
    const getTweetQuery = `
    SELECT tweet.tweet,
      (SELECT COUNT(*) FROM like WHERE like.tweet_id = tweet.tweet_id) AS like_count,
      (SELECT COUNT(*) FROM reply WHERE reply.tweet_id = tweet.tweet_id) AS Replies,
      tweet.date_time AS dateTime
    FROM tweet
    JOIN follower ON tweet.user_id = following_user_id
    WHERE follower_user_id = ${userId};`

    const tweetDetails = await db.all(getTweetQuery)
    response.send(tweetDetails)
  },
)

//AP!

app.get(
  '/tweets/:tweetId/likes/',
  authentication,
  followingUser,
  async (request, response) => {
    const {tweetId} = request.params
    const tweetLikerNameQuery = `
    SELECT username
    FROM like
    JOIN tweet ON like.tweet_id = tweet.tweet_id
    JOIN user ON user.user_id = tweet.user_id
    WHERE tweet.tweet_id = ${tweetId}`

    const tweetLikeName = await db.all(tweetLikerNameQuery)
    arrObj = {likes: []}
    for (let name of tweetLikeName) {
      arrObj.likes.push(name.username)
    }
    response.send(arrObj)
  },
)

// tweedId replies
app.get(
  '/tweets/:tweedId/replies/',
  authentication,
  followingUser,
  async (request, response) => {
    const {tweetId} = request.params
    const getRepliesNameQuery = `
    SELECT name, reply
    FROM tweet
    JOIN reply ON tweet.tweet_id = reply.tweet_id
    JOin user ON user.user_id = tweet.user_id
    WHERE tweet.tweet_id = ${tweetId};`

    const repliesName = await db.all(getRepliesNameQuery)
    response.send(repliesName)
  },
)

//user tweets
app.get('/user/tweets/', authentication, async (request, response) => {
  const {userId} = request

  const getAllTweetList = `
  SELECT tweet,
    (SELECT COUNT(*) FROM like JOIN tweet ON like.tweet_id = tweet.tweet_id) AS likes,
    (SELECT COUNT(*) FROM reply JOIN tweet ON reply.tweet_id = tweet.tweet_id) AS replies,
    tweet.date_time AS dateTime
  FROM user
  JOIN tweet ON user.user_id = tweet.user_id
  WHERE user.user_id = ${userId};`

  const allTweets = await db.all(getAllTweetList)
  response.send(allTweets)
})

//user tweets POst
app.post('/user/tweets/', authentication, async (request, response) => {
  const {tweet} = request.body
  const addNewTweetQuery = `
  INSERT INTO
  tweet(tweet)
  VALUES("${tweet}");`

  await db.run(addNewTweetQuery)
  response.send('Created a Tweet')
})

// tweets delete
app.delete('/tweets/:tweetId/', authentication, async (request, response) => {
  const {userId} = request
  const {tweetId} = request.params
  const getUserIdQuery = `
    SELECT user.user_id
    FROM user
    JOIN tweet ON user.user_id = tweet.user_id
    WHERE tweet_id = ${tweetId};`

  const tweetUserId = await db.get(getUserIdQuery)

  // console.log(tweetUserId)
  if (tweetUserId.user_id === userId) {
    const deleteTweetQuery = `
    DELETE FROM
    tweet
    WHERE tweet_id = ${tweetId}`

    await db.run(deleteTweetQuery)
    response.send('Tweet Removed')
  } else {
    response.status(401)
    response.send('Invalid Request')
  }
})
module.exports = app
