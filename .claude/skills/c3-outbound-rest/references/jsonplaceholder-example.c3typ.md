/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

/**
 * JSONPlaceholder REST API Client
 *
 * Complete working example using the JSONPlaceholder API (https://jsonplaceholder.typicode.com/)
 * This is a free, public REST API for testing and prototyping.
 *
 * Base URL: https://jsonplaceholder.typicode.com
 *
 * This example demonstrates:
 * - Simple GET requests
 * - POST requests with JSON body
 * - Path parameters for specific resources
 * - Query parameters for filtering
 * - Handling responses
 */
type JsonPlaceholderApi mixes REST {

  /**
   * Get all posts
   *
   * Endpoint: GET /posts
   * Returns: Array of post objects
   *
   * Example usage:
   *   JsonPlaceholderApi.setApiUrlAndAuth("https://jsonplaceholder.typicode.com/", "")
   *   posts = JsonPlaceholderApi.getAllPosts()
   */
  @rest(uri='posts', method='GET')
  getAllPosts: abstract function(): json

  /**
   * Get a specific post by ID
   *
   * Endpoint: GET /posts/{id}
   * Returns: Single post object
   *
   * Example usage:
   *   post = JsonPlaceholderApi.getPostById("1")
   */
  @rest(uri='posts/', method='GET')
  getPostById: abstract function(
    @rest(partOfURI=true) id: !string
  ): json

  /**
   * Get posts by user ID (query parameter)
   *
   * Endpoint: GET /posts?userId={userId}
   * Returns: Array of posts for the specified user
   *
   * Example usage:
   *   posts = JsonPlaceholderApi.getPostsByUser(1)
   */
  @rest(uri='posts', method='GET')
  getPostsByUser: abstract function(userId: !int): json

  /**
   * Create a new post
   *
   * Endpoint: POST /posts
   * Body: JSON with title, body, userId
   * Returns: Created post object with id
   *
   * Example usage:
   *   newPost = JsonPlaceholderApi.createPost("My Title", "Post content here", 1)
   */
  @rest(uri='posts', method='POST', contentType='application/json')
  createPost: abstract function(
    title: !string,
    body: !string,
    userId: !int
  ): json

  /**
   * Update a post
   *
   * Endpoint: PUT /posts/{id}
   * Body: JSON with title, body, userId
   * Returns: Updated post object
   *
   * Example usage:
   *   updated = JsonPlaceholderApi.updatePost("1", "Updated Title", "New content", 1)
   */
  @rest(uri='posts/', method='PUT', contentType='application/json')
  updatePost: abstract function(
    @rest(partOfURI=true) id: !string,
    title: !string,
    body: !string,
    userId: !int
  ): json

  /**
   * Delete a post
   *
   * Endpoint: DELETE /posts/{id}
   * Returns: Empty object {}
   *
   * Example usage:
   *   JsonPlaceholderApi.deletePost("1")
   */
  @rest(uri='posts/', method='DELETE')
  deletePost: abstract function(
    @rest(partOfURI=true) id: !string
  ): json

  /**
   * Get comments for a specific post
   *
   * Endpoint: GET /posts/{postId}/comments
   * Returns: Array of comment objects
   *
   * Example usage:
   *   comments = JsonPlaceholderApi.getPostComments("1")
   */
  @rest(uri='posts/', method='GET')
  getPostComments: abstract function(
    @rest(partOfURI=true, uriSuffix='/comments') postId: !string
  ): json

  /**
   * Get all users
   *
   * Endpoint: GET /users
   * Returns: Array of user objects
   */
  @rest(uri='users', method='GET')
  getAllUsers: abstract function(): json

  /**
   * Get a specific user
   *
   * Endpoint: GET /users/{id}
   * Returns: Single user object
   */
  @rest(uri='users/', method='GET')
  getUserById: abstract function(
    @rest(partOfURI=true) id: !string
  ): json

  /**
   * Get todos for a specific user
   *
   * Endpoint: GET /users/{userId}/todos
   * Returns: Array of todo objects
   *
   * This demonstrates building complex URIs with multiple path segments
   */
  @rest(uri='users/', method='GET')
  getUserTodos: abstract function(
    @rest(partOfURI=true, uriSuffix='/todos') userId: !string
  ): json
}
