import { delay } from 'redux-saga';
import { put, call, select } from 'redux-saga/effects';
import { Image } from 'react-native';

import WeatherService from '../services/weatherService';
import { fetchConference } from '../services/conferenceService';
import { fetchSurveyIds, fetchSurveyById } from '../services/surveyService';
import LinksService from '../services/quicklinksService';
import EventService from '../services/eventService';
import NewsService from '../services/newsService';
import {
	WEATHER_API_TTL,
	SURF_API_TTL,
	CONFERENCE_TTL,
	QUICKLINKS_API_TTL,
	EVENTS_API_TTL,
	NEWS_API_TTL,
	DATA_SAGA_TTL,
} from '../AppSettings';

const getWeather = (state) => (state.weather);
const getSurf = (state) => (state.surf);
const getConference = (state) => (state.conference);
const getLinks = (state) => (state.links);
const getSurvey = (state) => (state.survey);
const getEvents = (state) => (state.events);
const getNews = (state) => (state.news);
const getCards = (state) => (state.cards);

function* watchData() {
	while (true) {
		try {
			yield call(updateWeather);
			yield call(updateSurf);
			yield call(updateConference);
			yield call(updateLinks);
			yield call(updateEvents);
			yield call(updateNews);
			yield call(updateSurveys);
			yield put({ type: 'UPDATE_DINING' });
		} catch (err) {
			console.log(err);
		}
		yield delay(DATA_SAGA_TTL * 1000);
	}
}

function* updateWeather() {
	const { lastUpdated, data } = yield select(getWeather);
	const nowTime = new Date().getTime();
	const timeDiff = nowTime - lastUpdated;
	const weatherTTL = WEATHER_API_TTL * 1000;

	if (timeDiff < weatherTTL && data) {
		// Do nothing, no need to fetch new data
	} else {
		const weather = yield call(WeatherService.FetchWeather);
		if (weather) {
			yield put({ type: 'SET_WEATHER', weather });
		}
	}
}

function* updateSurf() {
	const { lastUpdated, data } = yield select(getSurf);
	const nowTime = new Date().getTime();
	const timeDiff = nowTime - lastUpdated;
	const ttl = SURF_API_TTL * 1000;

	if (timeDiff < ttl && data) {
		// Do nothing, no need to fetch new data
	} else {
		const surf = yield call(WeatherService.FetchSurf);
		if (surf) {
			yield put({ type: 'SET_SURF', surf });
		}
	}
}

function* updateConference() {
	const { lastUpdated, saved } = yield select(getConference);
	const { cards } = yield select(getCards);
	const nowTime = new Date().getTime();
	const timeDiff = nowTime - lastUpdated;
	const ttl = CONFERENCE_TTL * 1000;

	if (timeDiff > ttl && Array.isArray(saved)) {
		const conference = yield call(fetchConference);

		if (conference) {
			prefetchConferenceImages(conference);
			if (conference['start-time'] <= nowTime &&
				conference['end-time'] >= nowTime) {
				// Inside active conference window
				if (cards.conference.autoActivated === false) {
					// Initialize Conference for first time use
					// wipe saved data
					yield put({ type: 'CHANGED_CONFERENCE_SAVED', saved: [] });
					yield put({ type: 'SET_CONFERENCE', conference });
					// set active and autoActivated to true
					yield put({ type: 'UPDATE_CARD_STATE', id: 'conference', state: true });
					yield put({ type: 'UPDATE_AUTOACTIVATED_STATE', id: 'conference', state: true });
				} else if (cards.conference.active) {
					// remove any saved items that no longer exist
					if (saved.length > 0) {
						const stillsExists = yield call(savedExists, conference.uids, saved);
						yield put({ type: 'CHANGED_CONFERENCE_SAVED', saved: stillsExists });
					}
					yield put({ type: 'SET_CONFERENCE', conference });
				}
			} else {
				// Outside active conference window
				// Deactivate card one time when the conference is over
				if (cards.conference.autoActivated) {
					// set active and autoActivated to false
					yield put({ type: 'UPDATE_CARD_STATE', id: 'conference', state: false });
					yield put({ type: 'UPDATE_AUTOACTIVATED_STATE', id: 'conference', state: false });
				} else {
					// Auto-activated false, but manually re-enabled by user
					// Conference is over, do nothing
				}
			}
		}
	}
}

function* updateLinks() {
	const { lastUpdated, data } = yield select(getLinks);
	const nowTime = new Date().getTime();
	const timeDiff = nowTime - lastUpdated;
	const ttl = QUICKLINKS_API_TTL * 1000;

	if ((timeDiff < ttl) && data) {
		// Do nothing, no need to fetch new data
	} else {
		// Fetch for new data
		const links = yield call(LinksService.FetchQuicklinks);

		if (links) {
			yield put({ type: 'SET_LINKS', links });
			prefetchLinkImages(links);
		}
	}
}

function* updateEvents() {
	const { lastUpdated, data } = yield select(getEvents);
	const nowTime = new Date().getTime();
	const timeDiff = nowTime - lastUpdated;
	const ttl = EVENTS_API_TTL * 1000;

	if (timeDiff < ttl && data) {
		// Do nothing, no need to fetch new data
	} else {
		// Fetch for new data
		const events = yield call(EventService.FetchEvents);
		yield put({ type: 'SET_EVENTS', events });
	}
}

function* updateNews() {
	const { lastUpdated, data } = yield select(getNews);
	const nowTime = new Date().getTime();
	const timeDiff = nowTime - lastUpdated;
	const ttl = NEWS_API_TTL * 1000;

	if (timeDiff < ttl && data) {
		// Do nothing, no need to fetch new data
	} else {
		// Fetch for new data
		const news = yield call(NewsService.FetchNews);
		yield put({ type: 'SET_NEWS', news });
	}
}

function* updateSurveys() {
	// TODO: SurveyTTL
	const { allIds } = yield select(getSurvey);

	// Fetch for all survey ids
	const surveyIds = yield call(fetchSurveyIds);

	if (Array.isArray(surveyIds) && Array.isArray(surveyIds) && surveyIds.length > allIds.length) {
		// Fetch each new survey
		for (let i = 0; i < surveyIds.length; ++i) {
			const id = surveyIds[i];
			if (allIds.indexOf(id) < 0) {
				const survey = yield call(fetchSurveyById, id);
				yield put({ type: 'SET_SURVEY', id, survey });
			}
		}
		yield put({ type: 'SET_SURVEY_IDS', surveyIds });
	}
}

function savedExists(scheduleIds, savedArray) {
	const existsArray = [];
	if (Array.isArray(savedArray)) {
		for (let i = 0; i < savedArray.length; ++i) {
			if (scheduleIds.includes(savedArray[i])) {
				existsArray.push(savedArray[i]);
			}
		}
	}
	return existsArray;
}

function prefetchConferenceImages(conference) {
	Image.prefetch(conference['logo']);
	Image.prefetch(conference['logo-sm']);
}

function prefetchLinkImages(links) {
	if (Array.isArray(links)) {
		links.forEach((item) => {
			const imageUrl = item.icon;
			// Check if actually a url and not icon name
			if (imageUrl.indexOf('fontawesome:') !== 0) {
				Image.prefetch(imageUrl);
			}
		});
	}
}

function* dataSaga() {
	yield call(watchData);
}

export default dataSaga;
