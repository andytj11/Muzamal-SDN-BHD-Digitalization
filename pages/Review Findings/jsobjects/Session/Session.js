export default {
  bootstrap() {
    // Use a real user from your data; 401 has open items in the mock data
    return storeValue('currentUserId', 401);
  }
}
