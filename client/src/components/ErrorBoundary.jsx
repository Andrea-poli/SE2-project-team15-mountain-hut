// Catches a page that crashes while rendering (or a lazy page that fails to load) and shows a
// message instead of a blank screen. Used by PageLayout around <Outlet /> with key={pathname}:
// the navbar and the skip link stay, and going to another page starts again without the error.
// A class: React has no hook for error boundaries. React itself logs the error in the console.
import { Component } from 'react';
import { routes } from '../routes.js';

export default class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <>
        <title>Something went wrong – Mountain Hut</title>
        <h1>Something went wrong</h1>
        <p>This page could not be shown. Please try again later.</p>
        {/* A full reload, not a router Link: it also recovers when the error is on the home page
            itself, or when the code of a page could not be downloaded (e.g. after a new release). */}
        <a href={routes.home}>Go to the home page</a>
      </>
    );
  }
}
