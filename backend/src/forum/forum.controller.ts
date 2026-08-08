import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtPayload } from '../auth/entity/auth-token.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AppException } from '../common/exceptions/app.exception';
import { RequireFeatureFlag } from '../common/feature-flag/feature-flag.decorator';
import { FeatureFlagGuard } from '../common/feature-flag/feature-flag.guard';
import {
  CreateForumPostDto,
  CreateForumReplyDto,
  ForumCursorQueryDto,
  ForumPostListQueryDto,
  UpdateForumPostDto,
} from './dto';
import { ForumService } from './forum.service';
import { OptionalForumJwtGuard } from './guards/optional-forum-jwt.guard';
import { FORUM_ERROR } from './forum.constants';

type UserRequest = Request & { user: JwtPayload };
type OptionalUserRequest = Request & { user?: JwtPayload };

function forumId(value: string, label = '帖子'): bigint {
  if (!/^[1-9]\d*$/.test(value))
    throw new AppException(FORUM_ERROR.INVALID_ID, `无效的${label} ID`, 400);
  return BigInt(value);
}

@Controller('forum')
@UseGuards(FeatureFlagGuard)
@RequireFeatureFlag('forum.enabled')
export class ForumController {
  constructor(private readonly forum: ForumService) {}

  @Get('boards')
  @UseGuards(OptionalForumJwtGuard)
  boards(@Req() request: OptionalUserRequest) {
    return this.forum.boards(request.user ? BigInt(request.user.sub) : undefined);
  }

  @Get('me/posts')
  @UseGuards(JwtAuthGuard)
  myPosts(@Req() request: UserRequest) {
    return this.forum.myPosts(BigInt(request.user.sub));
  }

  @Get('me/replies')
  @UseGuards(JwtAuthGuard)
  myReplies(@Req() request: UserRequest) {
    return this.forum.myReplies(BigInt(request.user.sub));
  }

  @Get('posts')
  @UseGuards(OptionalForumJwtGuard)
  posts(@Req() request: OptionalUserRequest, @Query() query: ForumPostListQueryDto) {
    return this.forum.listPosts(query, request.user ? BigInt(request.user.sub) : undefined);
  }

  @Post('posts')
  @UseGuards(JwtAuthGuard)
  createPost(
    @Req() request: UserRequest,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: CreateForumPostDto,
  ) {
    return this.forum.createPost(BigInt(request.user.sub), request.ip ?? '', key ?? '', dto);
  }

  @Get('posts/:id')
  @UseGuards(OptionalForumJwtGuard)
  post(@Req() request: OptionalUserRequest, @Param('id') id: string) {
    return this.forum.postDetail(forumId(id), request.user ? BigInt(request.user.sub) : undefined);
  }

  @Patch('posts/:id')
  @UseGuards(JwtAuthGuard)
  updatePost(
    @Req() request: UserRequest,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: UpdateForumPostDto,
  ) {
    return this.forum.updatePost(
      BigInt(request.user.sub),
      forumId(id),
      request.ip ?? '',
      key ?? '',
      dto,
    );
  }

  @Delete('posts/:id')
  @UseGuards(JwtAuthGuard)
  deletePost(@Req() request: UserRequest, @Param('id') id: string) {
    return this.forum.deletePost(BigInt(request.user.sub), forumId(id));
  }

  @Get('posts/:id/replies')
  replies(@Param('id') id: string, @Query() query: ForumCursorQueryDto) {
    return this.forum.listReplies(forumId(id), query);
  }

  @Post('posts/:id/replies')
  @UseGuards(JwtAuthGuard)
  createReply(
    @Req() request: UserRequest,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: CreateForumReplyDto,
  ) {
    return this.forum.createReply(
      BigInt(request.user.sub),
      forumId(id),
      request.ip ?? '',
      key ?? '',
      dto,
    );
  }

  @Delete('replies/:id')
  @UseGuards(JwtAuthGuard)
  deleteReply(@Req() request: UserRequest, @Param('id') id: string) {
    return this.forum.deleteReply(BigInt(request.user.sub), forumId(id, '回复'));
  }

  @Put('posts/:id/like')
  @UseGuards(JwtAuthGuard)
  like(@Req() request: UserRequest, @Param('id') id: string) {
    return this.forum.likePost(BigInt(request.user.sub), forumId(id), request.ip ?? '');
  }

  @Delete('posts/:id/like')
  @UseGuards(JwtAuthGuard)
  unlike(@Req() request: UserRequest, @Param('id') id: string) {
    return this.forum.unlikePost(BigInt(request.user.sub), forumId(id));
  }
}
